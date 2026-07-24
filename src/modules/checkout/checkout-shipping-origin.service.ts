import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CheckoutHybridAddress } from '@/modules/integrations/vietmap/vietmap.service';
import { VietMapService } from '@/modules/integrations/vietmap/vietmap.service';
import {
  GhnService,
  type GhnAddressMapping,
} from '@/modules/shipping/ghn/ghn.service';
import { BoundedTtlCache } from '@/shared/cache/bounded-ttl-cache';
import {
  CheckoutRepository,
  type CheckoutCartRecord,
} from './checkout.repository';

export interface ResolvedShippingOrigin {
  branchId: string;
  ghnProvinceId: number;
  ghnDistrictId: number;
  ghnWardCode: string;
  verifiedAt: Date;
  source: 'PERSISTED_METADATA' | 'VIETMAP_REVERSE_V4' | 'VIETMAP_GEOCODE_V4';
}

type BranchShippingRecord = CheckoutCartRecord['branch'];

@Injectable()
export class CheckoutShippingOriginService {
  private readonly resolutions = new BoundedTtlCache<ResolvedShippingOrigin>(
    10 * 60 * 1_000,
    500,
  );

  constructor(
    private readonly repository: CheckoutRepository,
    private readonly vietmap: VietMapService,
    private readonly ghn: GhnService,
  ) {}

  resolveCheckoutShippingOrigin(
    branch: BranchShippingRecord,
  ): Promise<ResolvedShippingOrigin> {
    const version =
      branch.updatedAt instanceof Date
        ? branch.updatedAt.toISOString()
        : String(branch.updatedAt);
    return this.resolutions.get(`${branch.id}|${version}`, () =>
      this.resolveUncached(branch),
    );
  }

  private async resolveUncached(
    branch: BranchShippingRecord,
  ): Promise<ResolvedShippingOrigin> {
    if (!branch.isActive) {
      this.originUnsupported();
    }
    if (this.hasVerifiedMetadata(branch)) {
      return {
        branchId: branch.id,
        ghnProvinceId: branch.ghnProvinceId!,
        ghnDistrictId: branch.ghnDistrictId!,
        ghnWardCode: branch.ghnWardCode!.trim(),
        verifiedAt: branch.ghnMappingVerifiedAt!,
        source: 'PERSISTED_METADATA',
      };
    }

    const latitude = this.coordinate(branch.latitude);
    const longitude = this.coordinate(branch.longitude);
    if ((latitude === null) !== (longitude === null)) {
      this.originIncomplete();
    }

    let source: ResolvedShippingOrigin['source'];
    let coordinate: { latitude: number; longitude: number };
    if (latitude !== null && longitude !== null) {
      source = 'VIETMAP_REVERSE_V4';
      coordinate = { latitude, longitude };
    } else {
      source = 'VIETMAP_GEOCODE_V4';
      coordinate = await this.geocodeBranch(branch);
    }

    const hybrid = await this.vietmap.reverseHybridForCheckoutShipping(
      coordinate.latitude,
      coordinate.longitude,
    );
    const mapping = await this.resolveLegacyMapping(hybrid);
    await this.repository.updateBranchResolution(branch.id, {
      latitude: hybrid.current.latitude,
      longitude: hybrid.current.longitude,
      ghnProvinceId: mapping.provinceId,
      ghnDistrictId: mapping.districtId,
      ghnWardCode: mapping.wardCode,
      ghnMappingVerifiedAt: mapping.verifiedAt,
    });
    return {
      branchId: branch.id,
      ghnProvinceId: mapping.provinceId,
      ghnDistrictId: mapping.districtId,
      ghnWardCode: mapping.wardCode,
      verifiedAt: mapping.verifiedAt,
      source,
    };
  }

  private async geocodeBranch(
    branch: BranchShippingRecord,
  ): Promise<{ latitude: number; longitude: number }> {
    if (
      !branch.address?.trim() ||
      !branch.province?.trim() ||
      !branch.ward?.trim()
    ) {
      this.originIncomplete();
    }
    const fullAddress = [
      branch.address.trim(),
      branch.ward.trim(),
      branch.province.trim(),
      'Việt Nam',
    ].join(', ');
    const candidates =
      await this.vietmap.geocodeHybridForCheckoutShipping(fullAddress);
    const matching = candidates.filter(
      (candidate) =>
        candidate.countryCode === 'VN' &&
        this.sameAdministrativeName(
          candidate.current.provinceName,
          branch.province!,
        ) &&
        this.sameAdministrativeName(candidate.current.wardName, branch.ward!) &&
        Number.isFinite(candidate.current.latitude) &&
        Number.isFinite(candidate.current.longitude),
    );
    if (matching.length === 0) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_ORIGIN_GEOCODE_NOT_FOUND',
        message:
          'Chi nhánh hiện chưa có thông tin giao hàng GHN hợp lệ. Vui lòng chọn chi nhánh khác hoặc thử lại sau.',
      });
    }
    const complete = matching.filter((candidate) =>
      this.hasCompleteLegacyHierarchy(candidate),
    );
    if (matching.length === 1 && complete.length === 0) {
      this.originIncomplete();
    }
    if (complete.length !== 1) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_ORIGIN_GEOCODE_AMBIGUOUS',
        message:
          'Chi nhánh hiện chưa có thông tin giao hàng GHN hợp lệ. Vui lòng chọn chi nhánh khác hoặc thử lại sau.',
      });
    }
    return {
      latitude: complete[0].current.latitude,
      longitude: complete[0].current.longitude,
    };
  }

  private async resolveLegacyMapping(
    hybrid: CheckoutHybridAddress,
  ): Promise<GhnAddressMapping> {
    if (!this.hasCompleteLegacyHierarchy(hybrid)) {
      this.originIncomplete();
    }
    try {
      return await this.ghn.resolveCheckoutAddressExact(
        hybrid.legacy.provinceName,
        hybrid.legacy.districtName,
        hybrid.legacy.wardName,
      );
    } catch (error: unknown) {
      const code = this.exceptionCode(error);
      if (code === 'GHN_ADDRESS_UNSUPPORTED') {
        this.originUnsupported();
      }
      if (code === 'GHN_ADDRESS_MAPPING_INVALID') {
        throw new UnprocessableEntityException({
          code: 'CHECKOUT_ORIGIN_GHN_MAPPING_INVALID',
          message:
            'Chi nhánh hiện chưa có thông tin giao hàng GHN hợp lệ. Vui lòng chọn chi nhánh khác hoặc thử lại sau.',
        });
      }
      throw error;
    }
  }

  private hasVerifiedMetadata(branch: BranchShippingRecord): boolean {
    return (
      Number.isInteger(branch.ghnProvinceId) &&
      Number(branch.ghnProvinceId) > 0 &&
      Number.isInteger(branch.ghnDistrictId) &&
      Number(branch.ghnDistrictId) > 0 &&
      Boolean(branch.ghnWardCode?.trim()) &&
      branch.ghnMappingVerifiedAt instanceof Date
    );
  }

  private hasCompleteLegacyHierarchy(hybrid: CheckoutHybridAddress): boolean {
    return Boolean(
      hybrid.legacy.provinceName &&
      hybrid.legacy.districtName &&
      hybrid.legacy.wardName,
    );
  }

  private coordinate(value: BranchShippingRecord['latitude']): number | null {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private sameAdministrativeName(left: string, right: string): boolean {
    return (
      this.normalizeAdministrativeName(left) ===
      this.normalizeAdministrativeName(right)
    );
  }

  private normalizeAdministrativeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/đ/gi, 'd')
      .toLocaleLowerCase('vi-VN')
      .replace(
        /^(?:thanh pho|tinh|quan|huyen|thi xa|phuong|xa|thi tran)\s+/,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private exceptionCode(error: unknown): string | null {
    if (
      !(error instanceof UnprocessableEntityException) &&
      !(error instanceof BadRequestException)
    ) {
      return null;
    }
    const response = error.getResponse();
    if (typeof response !== 'object' || response === null) return null;
    const code = (response as Record<string, unknown>).code;
    return typeof code === 'string' ? code : null;
  }

  private originIncomplete(): never {
    throw new UnprocessableEntityException({
      code: 'CHECKOUT_ORIGIN_ADDRESS_INCOMPLETE',
      message:
        'Chi nhánh hiện chưa có thông tin giao hàng GHN hợp lệ. Vui lòng chọn chi nhánh khác hoặc thử lại sau.',
    });
  }

  private originUnsupported(): never {
    throw new UnprocessableEntityException({
      code: 'GHN_ORIGIN_ADDRESS_UNSUPPORTED',
      message:
        'Chi nhánh hiện chưa có thông tin giao hàng GHN hợp lệ. Vui lòng chọn chi nhánh khác hoặc thử lại sau.',
    });
  }
}
