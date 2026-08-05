import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { BOOKORA_STANDARD_2026_V1 } from '../policies/bookora-standard-2026-v1';
import type { ShippingRateRule } from '../policies/shipping-policy.types';

@Injectable()
export class ShippingFeeCalculator {
  calculate(chargeableWeightGram: number, rate: ShippingRateRule) {
    if (
      !Number.isSafeInteger(chargeableWeightGram) ||
      chargeableWeightGram <= 0 ||
      chargeableWeightGram >
        BOOKORA_STANDARD_2026_V1.maximumChargeableWeightGram
    ) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_SHIPPING_WEIGHT_LIMIT_EXCEEDED',
        message: 'Đơn hàng vượt giới hạn khối lượng giao hàng tiêu chuẩn.',
      });
    }
    const extraSteps = Math.max(
      0,
      Math.ceil(
        (chargeableWeightGram - rate.baseWeightGram) /
          BOOKORA_STANDARD_2026_V1.weightStepGram,
      ),
    );
    const baseShippingFee = rate.baseFee + extraSteps * rate.extraStepFee;
    const fuelSurcharge =
      (baseShippingFee * BOOKORA_STANDARD_2026_V1.fuelSurchargePercent) / 100;
    const shippingFee =
      Math.ceil(
        (baseShippingFee + fuelSurcharge) /
          BOOKORA_STANDARD_2026_V1.roundingUnit,
      ) * BOOKORA_STANDARD_2026_V1.roundingUnit;
    if (
      !Number.isSafeInteger(extraSteps) ||
      !Number.isSafeInteger(baseShippingFee) ||
      !Number.isSafeInteger(fuelSurcharge) ||
      !Number.isSafeInteger(shippingFee)
    ) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_SHIPPING_POLICY_UNAVAILABLE',
        message: 'Chưa thể tính phí vận chuyển cho địa chỉ này.',
      });
    }
    return { extraSteps, baseShippingFee, fuelSurcharge, shippingFee };
  }
}
