import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PACKAGING_POLICY_V1 } from '../policies/packaging-policy-v1';
import type { PackagingRule } from '../policies/shipping-policy.types';

@Injectable()
export class PackagingCalculator {
  calculate(
    totalItemQuantity: number,
    productWeightGram: number,
  ): PackagingRule {
    this.validate(totalItemQuantity, productWeightGram);
    const rules = PACKAGING_POLICY_V1.rules;
    const initialIndex = rules.findIndex(
      (rule) =>
        totalItemQuantity >= rule.minimumQuantity &&
        (rule.maximumQuantity === null ||
          totalItemQuantity <= rule.maximumQuantity),
    );
    const selected = rules
      .slice(initialIndex)
      .find((rule) => productWeightGram <= rule.maximumProductWeightGram);
    if (!selected) this.overweight();
    return selected;
  }

  private validate(totalItemQuantity: number, productWeightGram: number): void {
    if (
      !Number.isSafeInteger(totalItemQuantity) ||
      totalItemQuantity <= 0 ||
      !Number.isSafeInteger(productWeightGram) ||
      productWeightGram <= 0
    ) {
      throw new UnprocessableEntityException({
        code: 'CHECKOUT_PRODUCT_WEIGHT_INVALID',
        message:
          'Một số sản phẩm chưa có thông tin trọng lượng hợp lệ. Vui lòng thử lại sau.',
      });
    }
  }

  private overweight(): never {
    throw new UnprocessableEntityException({
      code: 'CHECKOUT_SHIPPING_WEIGHT_LIMIT_EXCEEDED',
      message: 'Đơn hàng vượt giới hạn khối lượng giao hàng tiêu chuẩn.',
    });
  }
}
