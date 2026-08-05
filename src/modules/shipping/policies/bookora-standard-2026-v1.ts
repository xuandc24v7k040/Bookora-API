import type {
  PricingDestinationType,
  ShippingRouteType,
} from './shipping-policy.types';

interface RateDefinition {
  wardFee: number;
  communeFee: number;
  baseWeightGram: number;
  extraStepFee: number;
}

const SHARED_RATES = Object.freeze({
  SAME_REGION: {
    wardFee: 30_000,
    communeFee: 35_000,
    baseWeightGram: 500,
    extraStepFee: 2_500,
  },
  ADJACENT_REGION: {
    wardFee: 30_000,
    communeFee: 37_000,
    baseWeightGram: 500,
    extraStepFee: 5_000,
  },
  FAR_REGION: {
    wardFee: 32_000,
    communeFee: 40_000,
    baseWeightGram: 500,
    extraStepFee: 5_000,
  },
} satisfies Record<
  Exclude<ShippingRouteType, 'SAME_PROVINCE' | 'SPECIAL_STANDARD'>,
  RateDefinition
>);

export const BOOKORA_STANDARD_2026_V1 = Object.freeze({
  policyCode: 'BOOKORA_STANDARD_2026_V1' as const,
  policyVersion: 1 as const,
  reference: 'GHTK_EXPRESS_2026' as const,
  maximumChargeableWeightGram: 20_000,
  weightStepGram: 500,
  fuelSurchargePercent: 5 as const,
  roundingUnit: 1_000 as const,
  majorOriginProvinceCodes: Object.freeze([1, 79] as const),
  specialRouteProvincePairs: Object.freeze([
    Object.freeze([1, 79] as const),
    Object.freeze([1, 48] as const),
    Object.freeze([48, 79] as const),
  ]),
  rates: Object.freeze({
    majorOrigin: Object.freeze({
      SAME_PROVINCE: {
        wardFee: 22_000,
        communeFee: 30_000,
        baseWeightGram: 3_000,
        extraStepFee: 2_500,
      },
      ...SHARED_RATES,
      SPECIAL_STANDARD: {
        wardFee: 30_000,
        communeFee: 40_000,
        baseWeightGram: 500,
        extraStepFee: 5_000,
      },
    } satisfies Record<ShippingRouteType, RateDefinition>),
    otherOrigin: Object.freeze({
      SAME_PROVINCE: {
        wardFee: 30_000,
        communeFee: 30_000,
        baseWeightGram: 3_000,
        extraStepFee: 2_500,
      },
      ...SHARED_RATES,
    } satisfies Record<
      Exclude<ShippingRouteType, 'SPECIAL_STANDARD'>,
      RateDefinition
    >),
  }),
});

export function destinationFee(
  rate: RateDefinition,
  destinationType: PricingDestinationType,
): number {
  return destinationType === 'WARD' ? rate.wardFee : rate.communeFee;
}
