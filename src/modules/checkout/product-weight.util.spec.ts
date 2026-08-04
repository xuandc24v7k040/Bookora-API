import {
  calculateTotalProductWeightGram,
  ProductWeightCalculationError,
} from './product-weight.util';

describe('calculateTotalProductWeightGram', () => {
  it('uses variant weight multiplied by cart quantity', () => {
    expect(
      calculateTotalProductWeightGram([
        { weightGram: 350, quantity: 2 },
        { weightGram: 420, quantity: 3 },
      ]),
    ).toBe(1_960);
  });

  it.each([
    { weightGram: 0, quantity: 1 },
    { weightGram: -1, quantity: 1 },
    { weightGram: 1.5, quantity: 1 },
    { weightGram: 350, quantity: 0 },
    { weightGram: 350, quantity: 1.5 },
  ])('fails closed for invalid input %#', (item) => {
    expect(() => calculateTotalProductWeightGram([item])).toThrow(
      ProductWeightCalculationError,
    );
  });
});
