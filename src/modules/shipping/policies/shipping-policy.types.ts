export type ShippingRegion = 'NORTH' | 'CENTRAL' | 'SOUTH';

export type ShippingRouteType =
  | 'SAME_PROVINCE'
  | 'SAME_REGION'
  | 'ADJACENT_REGION'
  | 'FAR_REGION'
  | 'SPECIAL_STANDARD';

export type ShippingDestinationType =
  | 'WARD'
  | 'COMMUNE'
  | 'SPECIAL_ZONE'
  | 'UNKNOWN';

export type PricingDestinationType = 'WARD' | 'COMMUNE';

export type DestinationTypeResolution =
  | 'AUTHORITATIVE'
  | 'DESTINATION_TYPE_FALLBACK_COMMUNE';

export type PackagingType =
  | 'SINGLE_BOOK_BAG'
  | 'SMALL_BOOK_BOX'
  | 'MEDIUM_BOOK_BOX'
  | 'LARGE_BOOK_BOX'
  | 'BULK_BOOK_BOX';

export interface PackagingRule {
  code: PackagingType;
  minimumQuantity: number;
  maximumQuantity: number | null;
  maximumProductWeightGram: number;
  packagingWeightGram: number;
}

export interface ShippingRateRule {
  baseFee: number;
  baseWeightGram: number;
  extraStepFee: number;
  ruleCode: string;
}

export interface ShippingQuoteBreakdown {
  policyCode: 'BOOKORA_STANDARD_2026_V1';
  policyVersion: 1;
  policyReference: 'GHTK_EXPRESS_2026';
  packagingPolicyCode: 'PACKAGING_POLICY_V1';
  packagingPolicyVersion: 1;
  routeType: ShippingRouteType;
  destinationType: PricingDestinationType;
  destinationTypeResolution: DestinationTypeResolution;
  productWeightGram: number;
  totalItemQuantity: number;
  packagingType: PackagingType;
  packagingWeightGram: number;
  grossWeightGram: number;
  chargeableWeightGram: number;
  baseWeightGram: number;
  baseFee: number;
  extraSteps: number;
  extraStepFee: number;
  baseShippingFee: number;
  fuelSurchargePercent: 5;
  fuelSurcharge: number;
  roundingUnit: 1000;
  shippingFee: number;
  ruleCode: string;
}

export interface ShippingPricingQuote extends ShippingQuoteBreakdown {
  serviceFee: number;
  insuranceFee: 0;
  codFee: 0;
  remoteAreaFee: 0;
  quotedAt: Date;
  expiresAt: Date;
  requestFingerprint: string;
  breakdown: ShippingQuoteBreakdown;
}
