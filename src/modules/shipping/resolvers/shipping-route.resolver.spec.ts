import { UnprocessableEntityException } from '@nestjs/common';
import {
  PROVINCE_REGION_BY_CODE,
  ShippingRouteResolver,
} from './shipping-route.resolver';

describe('ShippingRouteResolver', () => {
  const resolver = new ShippingRouteResolver();

  it.each([
    [92, 92, 'SAME_PROVINCE'],
    [92, 96, 'SAME_REGION'],
    [38, 79, 'ADJACENT_REGION'],
    [1, 92, 'FAR_REGION'],
    [92, 1, 'FAR_REGION'],
    [1, 79, 'SPECIAL_STANDARD'],
    [1, 48, 'SPECIAL_STANDARD'],
    [79, 48, 'SPECIAL_STANDARD'],
    [48, 79, 'ADJACENT_REGION'],
  ] as const)('resolves route %s -> %s', (origin, destination, expected) => {
    expect(resolver.resolve(origin, destination)).toBe(expected);
  });

  it('covers the complete 34-province two-level catalogue', () => {
    const codes = Object.keys(PROVINCE_REGION_BY_CODE).map(Number);
    expect(codes).toHaveLength(34);
    expect(new Set(codes).size).toBe(34);
  });

  it('normalizes canonical and legacy branch province names', () => {
    expect(resolver.resolveProvinceCode('  T.P.   HÀ NỘI  ')).toBe(1);
    expect(resolver.resolveProvinceCode('Tỉnh Hậu Giang')).toBe(92);
    expect(resolver.resolveProvinceCode('Thành phố Cần Thơ')).toBe(92);
  });

  it('fails closed for unsupported province data', () => {
    expect(() => resolver.resolve(999, 92)).toThrow(
      UnprocessableEntityException,
    );
    expect(() => resolver.resolveProvinceCode('Tỉnh không tồn tại')).toThrow(
      UnprocessableEntityException,
    );
  });
});
