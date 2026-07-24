import {
  BadGatewayException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BoundedTtlCache } from '@/shared/cache/bounded-ttl-cache';
import { GhnService, type GhnAddressMapping } from '../ghn/ghn.service';

type JsonRecord = Record<string, unknown>;

interface ProvinceV2 {
  code: number;
  name: string;
}

interface WardV2 extends ProvinceV2 {
  province_code: number;
}

interface LegacyWardV1 extends ProvinceV2 {
  codename: string;
  division_type: string;
  district_code: number;
}

interface LegacyWard extends LegacyWardV1 {
  province_code: number;
}

interface LegacyDistrict extends ProvinceV2 {
  province_code: number;
}

type LegacyProvince = ProvinceV2;

export interface LegacyAddressHint {
  provinceName: string;
  districtName: string;
  wardName: string;
}

export interface CompatibleShippingAddress {
  mapping: GhnAddressMapping;
  legacyProvinceName: string;
  legacyDistrictName: string;
  legacyWardName: string;
  legacyCandidateCount: number;
}

interface CandidateMapping extends CompatibleShippingAddress {
  tuple: string;
}

const PROVIDER_TIMEOUT_MS = 8_000;
const PROVIDER_CACHE_MS = 24 * 60 * 60 * 1_000;
const FINAL_CACHE_MS = 6 * 60 * 60 * 1_000;

@Injectable()
export class ShippingAddressCompatibilityService {
  private readonly provincesV2 = new BoundedTtlCache<ProvinceV2[]>(
    PROVIDER_CACHE_MS,
    1,
  );
  private readonly wardsV2 = new BoundedTtlCache<WardV2[]>(
    PROVIDER_CACHE_MS,
    100,
  );
  private readonly legacyCandidates = new BoundedTtlCache<LegacyWard[]>(
    PROVIDER_CACHE_MS,
    500,
  );
  private readonly legacyWards = new BoundedTtlCache<LegacyWardV1>(
    PROVIDER_CACHE_MS,
    2_000,
  );
  private readonly legacyDistricts = new BoundedTtlCache<LegacyDistrict>(
    PROVIDER_CACHE_MS,
    1_000,
  );
  private readonly legacyProvinces = new BoundedTtlCache<LegacyProvince>(
    PROVIDER_CACHE_MS,
    100,
  );
  private readonly finalMappings =
    new BoundedTtlCache<CompatibleShippingAddress>(FINAL_CACHE_MS, 1_000);

  constructor(private readonly ghn: GhnService) {}

  async resolveNewUnitNames(
    provinceName: string,
    wardName: string,
  ): Promise<{ province: ProvinceV2; ward: WardV2 }> {
    const provinces = await this.provincesV2.get('all', async () =>
      this.parseList<ProvinceV2>(
        await this.request('v2', '/p/'),
        this.isProvince,
      ),
    );
    const province = this.uniqueNameMatch(provinces, provinceName);
    if (!province) this.currentLocationIncomplete();

    const wards = await this.wardsV2.get(String(province.code), async () =>
      this.parseList<WardV2>(
        await this.request('v2', `/w/?province=${province.code}`),
        this.isWardV2,
      ),
    );
    const ward = this.uniqueNameMatch(wards, wardName);
    if (!ward || ward.province_code !== province.code) {
      this.currentLocationIncomplete();
    }
    return { province, ward };
  }

  resolveNewAddress(
    provinceCode: number,
    wardCode: number,
    hint?: LegacyAddressHint,
  ): Promise<CompatibleShippingAddress> {
    const hintKey = hint
      ? [
          this.normalizeName(hint.provinceName),
          this.normalizeName(hint.districtName),
          this.normalizeName(hint.wardName),
        ].join('|')
      : '';
    return this.finalMappings.get(
      `${provinceCode}|${wardCode}|${hintKey}`,
      () => this.resolveNewAddressUncached(provinceCode, wardCode, hint),
    );
  }

  private async resolveNewAddressUncached(
    provinceCode: number,
    wardCode: number,
    hint?: LegacyAddressHint,
  ): Promise<CompatibleShippingAddress> {
    const candidates = await this.legacyCandidates.get(
      String(wardCode),
      async () =>
        this.parseList<LegacyWard>(
          await this.request('v2', `/w/${wardCode}/to-legacies/`, true),
          this.isLegacyWard,
        ),
    );
    const scopedCandidates = candidates.filter(
      (candidate) =>
        candidate.code > 0 &&
        candidate.district_code > 0 &&
        candidate.province_code > 0,
    );
    if (scopedCandidates.length === 0) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_ADDRESS_LEGACY_MAPPING_NOT_FOUND',
        message:
          'Địa chỉ mới chưa có dữ liệu đối chiếu sang khu vực giao hàng.',
      });
    }

    const hydrated = await Promise.all(
      scopedCandidates.map((candidate) => this.hydrate(candidate)),
    );
    const hinted = hint
      ? hydrated.filter(
          (candidate) =>
            this.sameName(candidate.province.name, hint.provinceName) &&
            this.sameName(candidate.district.name, hint.districtName) &&
            this.sameName(candidate.ward.name, hint.wardName),
        )
      : hydrated;
    const candidatesToMap = hint && hinted.length > 0 ? hinted : hydrated;

    const mapped = await Promise.all(
      candidatesToMap.map(async (candidate) => {
        try {
          const mapping = await this.ghn.resolveAddressExact(
            candidate.province.name,
            candidate.ward.name,
            candidate.district.name,
          );
          return {
            status: 'mapped' as const,
            value: {
              mapping,
              legacyProvinceName: candidate.province.name,
              legacyDistrictName: candidate.district.name,
              legacyWardName: candidate.ward.name,
              legacyCandidateCount: scopedCandidates.length,
              tuple: `${mapping.provinceId}|${mapping.districtId}|${mapping.wardCode}`,
            },
          };
        } catch (error: unknown) {
          const code = this.exceptionCode(error);
          if (code === 'GHN_ADDRESS_UNSUPPORTED') {
            return { status: 'unsupported' as const };
          }
          if (code === 'GHN_ADDRESS_MAPPING_INVALID') {
            return { status: 'invalid' as const };
          }
          throw error;
        }
      }),
    );
    const unique = new Map<string, CandidateMapping>();
    mapped.forEach((result) => {
      if (result.status === 'mapped')
        unique.set(result.value.tuple, result.value);
    });
    if (unique.size === 1) {
      const selected = [...unique.values()][0];
      return {
        mapping: selected.mapping,
        legacyProvinceName: selected.legacyProvinceName,
        legacyDistrictName: selected.legacyDistrictName,
        legacyWardName: selected.legacyWardName,
        legacyCandidateCount: selected.legacyCandidateCount,
      };
    }
    if (unique.size > 1) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_ADDRESS_GHN_MAPPING_AMBIGUOUS',
        message:
          'Địa chỉ mới này tương ứng với nhiều khu vực giao hàng GHN. Vui lòng dùng vị trí hiện tại hoặc xác nhận khu vực giao hàng.',
      });
    }
    if (mapped.some((result) => result.status === 'unsupported')) {
      throw new UnprocessableEntityException({
        code: 'GHN_ADDRESS_UNSUPPORTED',
        message: 'GHN chưa hỗ trợ giao hàng đến địa chỉ này.',
      });
    }
    throw new UnprocessableEntityException({
      code: 'CHECKOUT_SAVED_ADDRESS_GHN_MAPPING_INVALID',
      message: 'Địa chỉ đã lưu chưa thể đối chiếu với khu vực giao hàng GHN.',
    });
  }

  private async hydrate(candidate: LegacyWard) {
    const [ward, district, province] = await Promise.all([
      this.legacyWards.get(String(candidate.code), async () =>
        this.parseOne<LegacyWardV1>(
          await this.request('v1', `/w/${candidate.code}`),
          this.isLegacyWardV1,
        ),
      ),
      this.legacyDistricts.get(String(candidate.district_code), async () =>
        this.parseOne<LegacyDistrict>(
          await this.request('v1', `/d/${candidate.district_code}`),
          this.isLegacyDistrict,
        ),
      ),
      this.legacyProvinces.get(String(candidate.province_code), async () =>
        this.parseOne<LegacyProvince>(
          await this.request('v1', `/p/${candidate.province_code}`),
          this.isProvince,
        ),
      ),
    ]);
    if (
      ward.code !== candidate.code ||
      ward.district_code !== district.code ||
      district.province_code !== province.code ||
      candidate.district_code !== district.code ||
      candidate.province_code !== province.code
    ) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_SAVED_ADDRESS_GHN_MAPPING_INVALID',
        message: 'Quan hệ địa giới legacy của địa chỉ không hợp lệ.',
      });
    }
    return { ward, district, province };
  }

  private async request(
    version: 'v1' | 'v2',
    path: string,
    allowNotFound = false,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://provinces.open-api.vn/api/${version}${path}`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      );
      if (allowNotFound && response.status === 404) return [];
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch {
      throw new BadGatewayException({
        code: 'ADDRESS_PROVIDER_UNAVAILABLE',
        message:
          'Dịch vụ đối chiếu địa chỉ tạm thời không khả dụng. Vui lòng thử lại.',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseList<T>(
    value: unknown,
    guard: (item: unknown) => item is T,
  ): T[] {
    if (!Array.isArray(value) || !value.every(guard)) {
      return this.invalidProviderResponse();
    }
    return value;
  }

  private parseOne<T>(value: unknown, guard: (item: unknown) => item is T): T {
    if (!guard(value)) return this.invalidProviderResponse();
    return value;
  }

  private uniqueNameMatch<T extends { name: string }>(
    items: T[],
    name: string,
  ): T | null {
    const matches = items.filter((item) => this.sameName(item.name, name));
    return matches.length === 1 ? matches[0] : null;
  }

  private sameName(left: string, right: string): boolean {
    return this.normalizeName(left) === this.normalizeName(right);
  }

  private normalizeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(
        /^(?:thanh pho|tinh|quan|huyen|thi xa|phuong|xa|thi tran)\s+/,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private readonly isProvince = (value: unknown): value is ProvinceV2 =>
    this.isRecord(value) &&
    Number.isInteger(value.code) &&
    typeof value.name === 'string';

  private readonly isWardV2 = (value: unknown): value is WardV2 => {
    if (!this.isProvince(value)) return false;
    const record = value as unknown as JsonRecord;
    return Number.isInteger(record.province_code);
  };

  private readonly isLegacyWardV1 = (value: unknown): value is LegacyWardV1 => {
    if (!this.isProvince(value)) return false;
    const record = value as unknown as JsonRecord;
    return (
      typeof record.codename === 'string' &&
      typeof record.division_type === 'string' &&
      Number.isInteger(record.district_code)
    );
  };

  private readonly isLegacyWard = (value: unknown): value is LegacyWard =>
    this.isLegacyWardV1(value) &&
    Number.isInteger((value as unknown as JsonRecord).province_code);

  private readonly isLegacyDistrict = (
    value: unknown,
  ): value is LegacyDistrict => {
    if (!this.isProvince(value)) return false;
    return Number.isInteger((value as unknown as JsonRecord).province_code);
  };

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private exceptionCode(error: unknown): string | null {
    if (!(error instanceof UnprocessableEntityException)) return null;
    const response = error.getResponse();
    if (!this.isRecord(response)) return null;
    return typeof response.code === 'string' ? response.code : null;
  }

  private currentLocationIncomplete(): never {
    throw new UnprocessableEntityException({
      code: 'CHECKOUT_CURRENT_LOCATION_INCOMPLETE',
      message: 'Không thể xác định tỉnh và phường/xã từ vị trí hiện tại.',
    });
  }

  private invalidProviderResponse(): never {
    throw new BadGatewayException({
      code: 'ADDRESS_PROVIDER_UNAVAILABLE',
      message: 'Dữ liệu đối chiếu địa chỉ tạm thời không hợp lệ.',
    });
  }
}
