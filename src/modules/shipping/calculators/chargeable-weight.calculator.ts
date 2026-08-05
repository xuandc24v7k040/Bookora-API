import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { BOOKORA_STANDARD_2026_V1 } from '../policies/bookora-standard-2026-v1';

@Injectable()
export class ChargeableWeightCalculator {
  calculate(productWeightGram: number, packagingWeightGram: number) {
    if (
      !Number.isSafeInteger(productWeightGram) ||
      productWeightGram <= 0 ||
      !Number.isSafeInteger(packagingWeightGram) ||
      packagingWeightGram <= 0
    ) {
      this.invalid();
    }
    const grossWeightGram = productWeightGram + packagingWeightGram;
    const chargeableWeightGram =
      Math.ceil(grossWeightGram / BOOKORA_STANDARD_2026_V1.weightStepGram) *
      BOOKORA_STANDARD_2026_V1.weightStepGram;
    if (
      !Number.isSafeInteger(grossWeightGram) ||
      !Number.isSafeInteger(chargeableWeightGram) ||
      grossWeightGram > BOOKORA_STANDARD_2026_V1.maximumChargeableWeightGram ||
      chargeableWeightGram >
        BOOKORA_STANDARD_2026_V1.maximumChargeableWeightGram
    ) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_SHIPPING_WEIGHT_LIMIT_EXCEEDED',
        message: 'Đơn hàng vượt giới hạn khối lượng giao hàng tiêu chuẩn.',
      });
    }
    return { grossWeightGram, chargeableWeightGram };
  }

  private invalid(): never {
    throw new UnprocessableEntityException({
      code: 'CHECKOUT_PRODUCT_WEIGHT_INVALID',
      message:
        'Một số sản phẩm chưa có thông tin trọng lượng hợp lệ. Vui lòng thử lại sau.',
    });
  }
}
