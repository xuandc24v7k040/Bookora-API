import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { BoundedTtlCache } from '@/shared/cache/bounded-ttl-cache';

type JsonRecord = Record<string, unknown>;

interface GhnEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

interface GhnProvince {
  ProvinceID: number;
  ProvinceName: string;
  NameExtension?: string[];
  Status?: number;
}

interface GhnDistrict {
  DistrictID: number;
  DistrictName: string;
  NameExtension?: string[];
  SupportType?: number;
  Status?: number;
}

interface GhnWard {
  WardCode: string;
  WardName: string;
  NameExtension?: string[];
  SupportType?: number;
  Status?: number;
}

interface GhnServiceOption {
  service_id: number;
  short_name: string;
  service_type_id: number;
}

export interface GhnAddressMapping {
  provinceId: number;
  provinceName: string;
  districtId: number;
  districtName: string;
  wardCode: string;
  wardName: string;
  verifiedAt: Date;
}

export interface ShippingPackageItem {
  name: string;
  code: string | null;
  quantity: number;
}

interface GatewayPackageItem extends ShippingPackageItem {
  weight: number;
  length: number;
  width: number;
  height: number;
}

export interface GhnQuoteInput {
  fromDistrictId: number;
  fromWardCode: string;
  toDistrictId: number;
  toWardCode: string;
  subtotal: number;
  codValue: number;
  items: ShippingPackageItem[];
}

export interface GhnQuote {
  provider: 'GHN';
  serviceId: number;
  serviceTypeId: number;
  serviceName: string;
  shippingFee: number;
  serviceFee: number;
  insuranceFee: number;
  codFee: number;
  remoteAreaFee: number;
  quotedAt: Date;
  expiresAt: Date;
  requestFingerprint: string;
  breakdown: Record<string, number>;
}

@Injectable()
export class GhnService {
  private readonly addressCache = new BoundedTtlCache<GhnAddressMapping>(
    6 * 60 * 60 * 1_000,
    500,
  );
  private readonly provincesCache = new BoundedTtlCache<GhnProvince[]>(
    24 * 60 * 60 * 1_000,
    1,
  );
  private readonly districtsCache = new BoundedTtlCache<GhnDistrict[]>(
    24 * 60 * 60 * 1_000,
    100,
  );
  private readonly wardsCache = new BoundedTtlCache<GhnWard[]>(
    24 * 60 * 60 * 1_000,
    500,
  );

  constructor(private readonly config: ConfigService) {}

  async resolveAddressExact(
    provinceName: string,
    wardName: string,
    districtName?: string | null,
  ): Promise<GhnAddressMapping> {
    const cacheKey = [provinceName, districtName ?? '', wardName]
      .map((value) => this.normalizeName(value))
      .join('|');
    return this.addressCache.get(cacheKey, () =>
      this.resolveAddressUncached(provinceName, wardName, districtName),
    );
  }

  async resolveCheckoutAddressExact(
    provinceName: string,
    districtName: string,
    wardName: string,
  ): Promise<GhnAddressMapping> {
    const cacheKey = ['checkout', provinceName, districtName, wardName]
      .map((value) => this.normalizeName(value))
      .join('|');
    return this.addressCache.get(cacheKey, async () => {
      const provinces = await this.provincesCache.get('all', () =>
        this.request<GhnProvince[]>('master-data/province', {}),
      );
      const province = provinces.find((item) =>
        this.matchesName(provinceName, item.ProvinceName, item.NameExtension),
      );
      if (!province) this.invalidAddressMapping();
      if (province.Status === 2) this.unsupportedAddress();

      const districts = await this.districtsCache.get(
        String(province.ProvinceID),
        () =>
          this.request<GhnDistrict[]>('master-data/district', {
            province_id: province.ProvinceID,
          }),
      );
      const district = districts.find((item) =>
        this.matchesName(districtName, item.DistrictName, item.NameExtension),
      );
      if (!district) this.invalidAddressMapping();
      if (!this.supportsDelivery(district.Status, district.SupportType)) {
        this.unsupportedAddress();
      }

      const wards = await this.wardsCache.get(String(district.DistrictID), () =>
        this.request<GhnWard[]>('master-data/ward', {
          district_id: district.DistrictID,
        }),
      );
      const ward = wards.find((item) =>
        this.matchesName(wardName, item.WardName, item.NameExtension),
      );
      if (!ward) this.invalidAddressMapping();
      if (!this.supportsDelivery(ward.Status, ward.SupportType)) {
        this.unsupportedAddress();
      }
      return {
        provinceId: province.ProvinceID,
        provinceName: province.ProvinceName,
        districtId: district.DistrictID,
        districtName: district.DistrictName,
        wardCode: String(ward.WardCode),
        wardName: ward.WardName,
        verifiedAt: new Date(),
      };
    });
  }

  private async resolveAddressUncached(
    provinceName: string,
    wardName: string,
    districtName?: string | null,
  ): Promise<GhnAddressMapping> {
    const provinces = await this.provincesCache.get('all', () =>
      this.request<GhnProvince[]>('master-data/province', {}),
    );
    const province = provinces.find((item) =>
      this.matchesName(provinceName, item.ProvinceName, item.NameExtension),
    );
    if (!province) this.invalidAddressMapping();

    const districts = await this.districtsCache.get(
      String(province.ProvinceID),
      () =>
        this.request<GhnDistrict[]>('master-data/district', {
          province_id: province.ProvinceID,
        }),
    );
    const candidateDistricts = districtName
      ? districts.filter((item) =>
          this.matchesName(districtName, item.DistrictName, item.NameExtension),
        )
      : districts;
    if (candidateDistricts.length === 0) this.invalidAddressMapping();

    let matchedUnsupportedUnit = false;
    for (const district of candidateDistricts) {
      const wards = await this.wardsCache.get(String(district.DistrictID), () =>
        this.request<GhnWard[]>('master-data/ward', {
          district_id: district.DistrictID,
        }),
      );
      const ward = wards.find((item) =>
        this.matchesName(wardName, item.WardName, item.NameExtension),
      );
      if (!ward) continue;
      if (
        !this.supportsDelivery(district.Status, district.SupportType) ||
        !this.supportsDelivery(ward.Status, ward.SupportType)
      ) {
        matchedUnsupportedUnit = true;
        continue;
      }
      return {
        provinceId: province.ProvinceID,
        provinceName: province.ProvinceName,
        districtId: district.DistrictID,
        districtName: district.DistrictName,
        wardCode: String(ward.WardCode),
        wardName: ward.WardName,
        verifiedAt: new Date(),
      };
    }
    if (matchedUnsupportedUnit) this.unsupportedAddress();
    this.invalidAddressMapping();
  }

  async quote(input: GhnQuoteInput): Promise<GhnQuote> {
    if (input.items.length === 0) {
      throw new BadGatewayException({
        code: 'SHIPPING_DIMENSIONS_MISSING',
        message: 'Sản phẩm chưa có thông tin vận chuyển.',
      });
    }
    const shopId = this.config.getOrThrow<number>('shipping.ghn.shopId');
    const services = await this.request<GhnServiceOption[]>(
      'v2/shipping-order/available-services',
      {
        shop_id: shopId,
        from_district: input.fromDistrictId,
        to_district: input.toDistrictId,
      },
    );
    const service =
      services.find(
        (item) =>
          item.service_type_id === 2 ||
          this.normalizeName(item.short_name).includes('chuan'),
      ) ?? services.find((item) => item.service_type_id > 0);
    if (!service) this.unavailable();

    const gatewayItems = input.items.map((item) => ({
      ...item,
      weight: this.config.getOrThrow<number>(
        'shipping.ghn.defaultItemWeightGrams',
      ),
      length: this.config.getOrThrow<number>(
        'shipping.ghn.defaultPackageLengthCm',
      ),
      width: this.config.getOrThrow<number>(
        'shipping.ghn.defaultPackageWidthCm',
      ),
      height: this.config.getOrThrow<number>(
        'shipping.ghn.defaultPackageHeightCm',
      ),
    }));
    const packageSize = this.aggregatePackage(gatewayItems);
    const insuranceValue = Math.min(
      5_000_000,
      Math.max(0, Math.round(input.subtotal)),
    );
    const payload = {
      service_id: service.service_id,
      service_type_id: service.service_type_id,
      from_district_id: input.fromDistrictId,
      from_ward_code: input.fromWardCode,
      to_district_id: input.toDistrictId,
      to_ward_code: input.toWardCode,
      ...packageSize,
      insurance_value: insuranceValue,
      cod_value: Math.min(10_000_000, Math.max(0, Math.round(input.codValue))),
      coupon: null,
      items: gatewayItems,
    };
    const fee = await this.request<JsonRecord>(
      'v2/shipping-order/fee',
      payload,
      true,
    );
    const total = this.number(fee.total);
    if (total === null || total < 0) this.unavailable();
    const serviceFee = this.number(fee.service_fee) ?? 0;
    const insuranceFee = this.number(fee.insurance_fee) ?? 0;
    const codFee = this.number(fee.cod_fee) ?? 0;
    const remoteAreaFee =
      (this.number(fee.pick_remote_areas_fee) ?? 0) +
      (this.number(fee.deliver_remote_areas_fee) ?? 0);
    const quotedAt = new Date();
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    return {
      provider: 'GHN',
      serviceId: service.service_id,
      serviceTypeId: service.service_type_id,
      serviceName: service.short_name || 'GHN Tiêu chuẩn',
      shippingFee: total,
      serviceFee,
      insuranceFee,
      codFee,
      remoteAreaFee,
      quotedAt,
      expiresAt: new Date(quotedAt.getTime() + 10 * 60_000),
      requestFingerprint: fingerprint,
      breakdown: {
        total,
        serviceFee,
        insuranceFee,
        codFee,
        remoteAreaFee,
      },
    };
  }

  private aggregatePackage(items: GatewayPackageItem[]) {
    const expandedHeight = items.reduce(
      (sum, item) => sum + item.height * item.quantity,
      0,
    );
    return {
      weight: items.reduce((sum, item) => sum + item.weight * item.quantity, 0),
      length: Math.max(...items.map((item) => item.length)),
      width: Math.max(...items.map((item) => item.width)),
      height: expandedHeight,
    };
  }

  private async request<T>(
    path: string,
    body: Readonly<Record<string, unknown>>,
    includeShopHeader = false,
  ): Promise<T> {
    const baseUrl = this.config.getOrThrow<string>('shipping.ghn.baseUrl');
    const token = this.config.getOrThrow<string>('shipping.ghn.token');
    const timeoutMs = this.config.getOrThrow<number>('shipping.ghn.timeoutMs');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            token,
            ...(includeShopHeader
              ? {
                  shopid: String(
                    this.config.getOrThrow<number>('shipping.ghn.shopId'),
                  ),
                }
              : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      if (!response.ok) this.unavailable();
      const envelope = (await response.json()) as GhnEnvelope<T>;
      if (envelope.code !== 200 || envelope.data == null) this.unavailable();
      return envelope.data;
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException({
          code: 'GHN_PROVIDER_UNAVAILABLE',
          message: 'Không thể tính phí vận chuyển GHN lúc này.',
        });
      }
      this.unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }

  private matchesName(
    input: string,
    official: string,
    extensions: string[] = [],
  ): boolean {
    const normalized = this.normalizeName(input);
    return [official, ...extensions].some(
      (candidate) => this.normalizeName(candidate) === normalized,
    );
  }

  private normalizeName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .replace(
        /^(tinh|thanh pho|tp\.?|quan|huyen|thi xa|phuong|xa|thi tran)\s+/i,
        '',
      )
      .trim()
      .toLocaleLowerCase('vi-VN');
  }

  private supportsDelivery(
    status: number | undefined,
    supportType: number | undefined,
  ): boolean {
    return status !== 2 && (supportType === 2 || supportType === 3);
  }

  private number(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private unsupportedAddress(): never {
    throw new UnprocessableEntityException({
      code: 'GHN_ADDRESS_UNSUPPORTED',
      message: 'Địa chỉ chưa được GHN hỗ trợ.',
    });
  }

  private invalidAddressMapping(): never {
    throw new UnprocessableEntityException({
      code: 'GHN_ADDRESS_MAPPING_INVALID',
      message: 'Không thể đối chiếu địa chỉ với danh mục GHN.',
    });
  }

  private unavailable(): never {
    throw new BadGatewayException({
      code: 'GHN_PROVIDER_UNAVAILABLE',
      message: 'Không thể tính phí vận chuyển GHN lúc này.',
    });
  }
}
