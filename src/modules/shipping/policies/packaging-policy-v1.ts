import type { PackagingRule } from './shipping-policy.types';

export const PACKAGING_POLICY_V1 = Object.freeze({
  code: 'PACKAGING_POLICY_V1' as const,
  version: 1 as const,
  rules: Object.freeze([
    {
      code: 'SINGLE_BOOK_BAG',
      minimumQuantity: 1,
      maximumQuantity: 1,
      maximumProductWeightGram: 1_000,
      packagingWeightGram: 100,
    },
    {
      code: 'SMALL_BOOK_BOX',
      minimumQuantity: 2,
      maximumQuantity: 3,
      maximumProductWeightGram: 2_000,
      packagingWeightGram: 200,
    },
    {
      code: 'MEDIUM_BOOK_BOX',
      minimumQuantity: 4,
      maximumQuantity: 6,
      maximumProductWeightGram: 4_000,
      packagingWeightGram: 350,
    },
    {
      code: 'LARGE_BOOK_BOX',
      minimumQuantity: 7,
      maximumQuantity: 10,
      maximumProductWeightGram: 7_000,
      packagingWeightGram: 500,
    },
    {
      code: 'BULK_BOOK_BOX',
      minimumQuantity: 11,
      maximumQuantity: null,
      maximumProductWeightGram: 15_000,
      packagingWeightGram: 800,
    },
  ] satisfies readonly PackagingRule[]),
});
