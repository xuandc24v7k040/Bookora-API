import { UnprocessableEntityException } from '@nestjs/common';
import { ChargeableWeightCalculator } from './chargeable-weight.calculator';

describe('ChargeableWeightCalculator', () => {
  const calculator = new ChargeableWeightCalculator();

  it.each([
    [400, 100, 500, 500],
    [401, 100, 501, 1_000],
    [899, 100, 999, 1_000],
    [900, 100, 1_000, 1_000],
    [901, 100, 1_001, 1_500],
  ])(
    'rounds gross %s + %s by 500 g',
    (product, packaging, gross, chargeable) => {
      expect(calculator.calculate(product, packaging)).toEqual({
        grossWeightGram: gross,
        chargeableWeightGram: chargeable,
      });
    },
  );

  it('rejects gross or chargeable weight beyond 20 kg', () => {
    expect(() => calculator.calculate(19_500, 800)).toThrow(
      UnprocessableEntityException,
    );
  });
});
