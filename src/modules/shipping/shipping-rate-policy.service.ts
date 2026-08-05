import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  BOOKORA_STANDARD_2026_V1,
  destinationFee,
} from './policies/bookora-standard-2026-v1';
import type {
  PricingDestinationType,
  ShippingRateRule,
  ShippingRouteType,
} from './policies/shipping-policy.types';

@Injectable()
export class ShippingRatePolicyService {
  resolve(
    originProvinceCode: number,
    routeType: ShippingRouteType,
    destinationType: PricingDestinationType,
  ): ShippingRateRule {
    const majorOrigin = BOOKORA_STANDARD_2026_V1.majorOriginProvinceCodes.some(
      (code) => code === originProvinceCode,
    );
    const rates = majorOrigin
      ? BOOKORA_STANDARD_2026_V1.rates.majorOrigin
      : BOOKORA_STANDARD_2026_V1.rates.otherOrigin;
    const rate = this.rateForRoute(rates, routeType);
    const originCode = majorOrigin ? 'HANOI_HCM' : 'OTHER_ORIGIN';
    return {
      baseFee: destinationFee(rate, destinationType),
      baseWeightGram: rate.baseWeightGram,
      extraStepFee: rate.extraStepFee,
      ruleCode: `${originCode}_${routeType}_${destinationType}`,
    };
  }

  private rateForRoute(
    rates:
      | typeof BOOKORA_STANDARD_2026_V1.rates.majorOrigin
      | typeof BOOKORA_STANDARD_2026_V1.rates.otherOrigin,
    routeType: ShippingRouteType,
  ) {
    if (routeType === 'SPECIAL_STANDARD' && !('SPECIAL_STANDARD' in rates)) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_SHIPPING_POLICY_UNAVAILABLE',
        message: 'Chưa thể tính phí vận chuyển cho địa chỉ này.',
      });
    }
    return rates[routeType as keyof typeof rates];
  }
}
