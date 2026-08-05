import { UnprocessableEntityException } from '@nestjs/common';
import { PackagingCalculator } from './packaging.calculator';

describe('PACKAGING_POLICY_V1', () => {
  const calculator = new PackagingCalculator();

  it.each([
    [1, 'SINGLE_BOOK_BAG', 100],
    [2, 'SMALL_BOOK_BOX', 200],
    [3, 'SMALL_BOOK_BOX', 200],
    [4, 'MEDIUM_BOOK_BOX', 350],
    [6, 'MEDIUM_BOOK_BOX', 350],
    [7, 'LARGE_BOOK_BOX', 500],
    [10, 'LARGE_BOOK_BOX', 500],
    [11, 'BULK_BOOK_BOX', 800],
  ] as const)(
    'selects packaging for quantity %s',
    (quantity, code, packagingWeightGram) => {
      expect(calculator.calculate(quantity, 500)).toEqual(
        expect.objectContaining({ code, packagingWeightGram }),
      );
    },
  );

  it('upgrades overweight packaging without downgrading a quantity-selected box', () => {
    expect(calculator.calculate(3, 2_400).code).toBe('MEDIUM_BOOK_BOX');
    expect(calculator.calculate(7, 500).code).toBe('LARGE_BOOK_BOX');
  });

  it.each([
    [1, 15_001],
    [11, 15_001],
  ])('fails closed beyond the maximum packaging limit', (quantity, weight) => {
    expect(() => calculator.calculate(quantity, weight)).toThrow(
      UnprocessableEntityException,
    );
  });

  it.each([
    [0, 500],
    [1.5, 500],
    [1, 0],
    [1, -1],
    [1, 1.5],
  ])('rejects invalid quantity/weight inputs', (quantity, weight) => {
    expect(() => calculator.calculate(quantity, weight)).toThrow(
      UnprocessableEntityException,
    );
  });
});
