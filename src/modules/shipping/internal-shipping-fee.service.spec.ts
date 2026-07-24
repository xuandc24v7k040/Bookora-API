import { UnprocessableEntityException } from '@nestjs/common';
import {
  InternalShippingFeeService,
  PROVINCE_REGION_BY_CODE,
} from './internal-shipping-fee.service';

describe('InternalShippingFeeService', () => {
  const service = new InternalShippingFeeService();

  it.each([
    [92, 92, 15_000, 'SAME_PROVINCE'],
    [92, 96, 30_000, 'SAME_REGION'],
    [1, 38, 40_000, 'ADJACENT_REGION'],
    [38, 79, 40_000, 'ADJACENT_REGION'],
    [1, 79, 50_000, 'FAR_REGION'],
  ] as const)(
    'calculates %s -> %s',
    (branchProvinceCode, destinationProvinceCode, fee, rule) => {
      const result = service.calculate({
        branchProvinceCode,
        destinationProvinceCode,
      });
      expect(result.fee.toNumber()).toBe(fee);
      expect(result.rule).toBe(rule);
    },
  );

  it('is symmetric across every supported province pair', () => {
    const codes = Object.keys(PROVINCE_REGION_BY_CODE).map(Number);
    for (const left of codes) {
      for (const right of codes) {
        expect(
          service
            .calculate({
              branchProvinceCode: left,
              destinationProvinceCode: right,
            })
            .fee.toNumber(),
        ).toBe(
          service
            .calculate({
              branchProvinceCode: right,
              destinationProvinceCode: left,
            })
            .fee.toNumber(),
        );
      }
    }
  });

  it('covers the complete 34-province two-level catalogue without duplicates', () => {
    const codes = Object.keys(PROVINCE_REGION_BY_CODE).map(Number);
    expect(codes).toHaveLength(34);
    expect(new Set(codes).size).toBe(34);
  });

  it('resolves deterministic normalized province names for legacy branches', () => {
    expect(service.resolveProvinceCode('Thành phố Cần Thơ')).toBe(92);
    expect(service.resolveProvinceCode('  TỈNH   QUẢNG NINH ')).toBe(22);
  });

  it('rejects unknown province codes with a friendly domain error', () => {
    expect(() =>
      service.calculate({
        branchProvinceCode: 999,
        destinationProvinceCode: 92,
      }),
    ).toThrow(UnprocessableEntityException);
  });
});
