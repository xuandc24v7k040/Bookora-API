import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { BOOKORA_STANDARD_2026_V1 } from '../policies/bookora-standard-2026-v1';
import type {
  ShippingRegion,
  ShippingRouteType,
} from '../policies/shipping-policy.types';

const NORTH_PROVINCE_CODES = [
  1, 4, 8, 11, 12, 14, 15, 19, 20, 22, 24, 25, 31, 33, 37,
] as const;
const CENTRAL_PROVINCE_CODES = [
  38, 40, 42, 44, 46, 48, 51, 52, 56, 66, 68,
] as const;
const SOUTH_PROVINCE_CODES = [72, 75, 79, 82, 86, 91, 92, 96] as const;

export const PROVINCE_REGION_BY_CODE: Readonly<Record<number, ShippingRegion>> =
  Object.freeze({
    ...Object.fromEntries(NORTH_PROVINCE_CODES.map((code) => [code, 'NORTH'])),
    ...Object.fromEntries(
      CENTRAL_PROVINCE_CODES.map((code) => [code, 'CENTRAL']),
    ),
    ...Object.fromEntries(SOUTH_PROVINCE_CODES.map((code) => [code, 'SOUTH'])),
  }) as Readonly<Record<number, ShippingRegion>>;

const PROVINCE_CODE_BY_NORMALIZED_NAME: Readonly<Record<string, number>> =
  Object.freeze({
    'ha noi': 1,
    'cao bang': 4,
    'tuyen quang': 8,
    'dien bien': 11,
    'lai chau': 12,
    'son la': 14,
    'lao cai': 15,
    'thai nguyen': 19,
    'lang son': 20,
    'quang ninh': 22,
    'bac ninh': 24,
    'phu tho': 25,
    'hai phong': 31,
    'hung yen': 33,
    'ninh binh': 37,
    'thanh hoa': 38,
    'nghe an': 40,
    'ha tinh': 42,
    'quang tri': 44,
    hue: 46,
    'da nang': 48,
    'quang ngai': 51,
    'gia lai': 52,
    'khanh hoa': 56,
    'dak lak': 66,
    'lam dong': 68,
    'tay ninh': 72,
    'dong nai': 75,
    'ho chi minh': 79,
    'dong thap': 82,
    'vinh long': 86,
    'an giang': 91,
    'can tho': 92,
    'hau giang': 92,
    'ca mau': 96,
  });

@Injectable()
export class ShippingRouteResolver {
  resolve(
    originProvinceCode: number,
    destinationProvinceCode: number,
  ): ShippingRouteType {
    const originRegion = this.requireRegion(originProvinceCode);
    const destinationRegion = this.requireRegion(destinationProvinceCode);

    if (originProvinceCode === destinationProvinceCode) return 'SAME_PROVINCE';
    if (this.isSpecialRoute(originProvinceCode, destinationProvinceCode)) {
      return 'SPECIAL_STANDARD';
    }
    if (originRegion === destinationRegion) return 'SAME_REGION';
    if (
      (originRegion === 'NORTH' && destinationRegion === 'SOUTH') ||
      (originRegion === 'SOUTH' && destinationRegion === 'NORTH')
    ) {
      return 'FAR_REGION';
    }
    return 'ADJACENT_REGION';
  }

  resolveProvinceCode(provinceName: string | null | undefined): number {
    const code = provinceName
      ? PROVINCE_CODE_BY_NORMALIZED_NAME[
          this.normalizeProvinceName(provinceName)
        ]
      : undefined;
    if (code === undefined) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_SHIPPING_PROVINCE_REQUIRED',
        message:
          'Chi nhánh chưa có tỉnh/thành phố hợp lệ để tính phí vận chuyển.',
      });
    }
    return code;
  }

  normalizeProvinceName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/đ/gi, 'd')
      .toLocaleLowerCase('vi-VN')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^(?:(?:t\s*\.\s*p\s*\.?|tp\s*\.?)|thanh pho|tinh)\s+/, '');
  }

  private requireRegion(provinceCode: number): ShippingRegion {
    const region = PROVINCE_REGION_BY_CODE[provinceCode];
    if (!region) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_SHIPPING_PROVINCE_UNSUPPORTED',
        message:
          'Tỉnh/thành phố này hiện chưa được hỗ trợ tính phí vận chuyển.',
      });
    }
    return region;
  }

  private isSpecialRoute(origin: number, destination: number): boolean {
    return (
      BOOKORA_STANDARD_2026_V1.majorOriginProvinceCodes.some(
        (code) => code === origin,
      ) &&
      BOOKORA_STANDARD_2026_V1.specialRouteProvincePairs.some(
        ([left, right]) =>
          (left === origin && right === destination) ||
          (left === destination && right === origin),
      )
    );
  }
}
