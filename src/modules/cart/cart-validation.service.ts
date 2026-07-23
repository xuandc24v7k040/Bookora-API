import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@/generated/prisma/client';
import { CartItemStatus } from './dto';

interface CartValidationInput {
  branchActive: boolean;
  productStatus: ProductStatus;
  variantActive: boolean;
  quantity: number;
  availableQuantity: number;
  currentUnitPrice: number;
  lastKnownUnitPrice: number;
}

export interface CartValidationResult {
  primaryStatus: CartItemStatus;
  issues: CartItemStatus[];
  isCheckoutEligible: boolean;
  isQuantityEditable: boolean;
}

const PRIORITY: CartItemStatus[] = [
  CartItemStatus.BRANCH_INACTIVE,
  CartItemStatus.PRODUCT_INACTIVE,
  CartItemStatus.VARIANT_INACTIVE,
  CartItemStatus.OUT_OF_STOCK,
  CartItemStatus.INSUFFICIENT_STOCK,
  CartItemStatus.PRICE_CHANGED,
];

@Injectable()
export class CartValidationService {
  evaluate(input: CartValidationInput): CartValidationResult {
    const issues: CartItemStatus[] = [];
    if (!input.branchActive) issues.push(CartItemStatus.BRANCH_INACTIVE);
    if (input.productStatus !== ProductStatus.ACTIVE) {
      issues.push(CartItemStatus.PRODUCT_INACTIVE);
    }
    if (!input.variantActive) issues.push(CartItemStatus.VARIANT_INACTIVE);
    if (input.availableQuantity <= 0) {
      issues.push(CartItemStatus.OUT_OF_STOCK);
    } else if (input.quantity > input.availableQuantity) {
      issues.push(CartItemStatus.INSUFFICIENT_STOCK);
    }
    if (input.currentUnitPrice !== input.lastKnownUnitPrice) {
      issues.push(CartItemStatus.PRICE_CHANGED);
    }

    const primaryStatus =
      PRIORITY.find((status) => issues.includes(status)) ??
      CartItemStatus.AVAILABLE;
    const blocking = issues.some(
      (status) => status !== CartItemStatus.PRICE_CHANGED,
    );

    return {
      primaryStatus,
      issues,
      isCheckoutEligible: !blocking,
      isQuantityEditable: !blocking,
    };
  }
}
