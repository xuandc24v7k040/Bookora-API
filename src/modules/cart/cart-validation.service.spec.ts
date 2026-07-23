import { ProductStatus } from '@/generated/prisma/client';
import { CartValidationService } from './cart-validation.service';
import { CartItemStatus } from './dto';

describe('CartValidationService', () => {
  const service = new CartValidationService();
  const available = {
    branchActive: true,
    productStatus: ProductStatus.ACTIVE,
    variantActive: true,
    quantity: 1,
    availableQuantity: 3,
    currentUnitPrice: 79000,
    lastKnownUnitPrice: 79000,
  };

  it('keeps an available item checkout eligible', () => {
    expect(service.evaluate(available)).toEqual({
      primaryStatus: CartItemStatus.AVAILABLE,
      issues: [],
      isCheckoutEligible: true,
      isQuantityEditable: true,
    });
  });

  it('reports price changes without blocking checkout', () => {
    expect(
      service.evaluate({ ...available, currentUnitPrice: 69000 }),
    ).toMatchObject({
      primaryStatus: CartItemStatus.PRICE_CHANGED,
      issues: [CartItemStatus.PRICE_CHANGED],
      isCheckoutEligible: true,
    });
  });

  it.each([
    [{ branchActive: false }, CartItemStatus.BRANCH_INACTIVE],
    [
      { productStatus: ProductStatus.INACTIVE },
      CartItemStatus.PRODUCT_INACTIVE,
    ],
    [{ variantActive: false }, CartItemStatus.VARIANT_INACTIVE],
    [{ availableQuantity: 0 }, CartItemStatus.OUT_OF_STOCK],
    [{ quantity: 4, availableQuantity: 3 }, CartItemStatus.INSUFFICIENT_STOCK],
  ])('blocks invalid state %#', (changes, expected) => {
    expect(service.evaluate({ ...available, ...changes })).toMatchObject({
      primaryStatus: expected,
      isCheckoutEligible: false,
      isQuantityEditable: false,
    });
  });

  it('uses the documented status priority', () => {
    expect(
      service.evaluate({
        ...available,
        branchActive: false,
        productStatus: ProductStatus.INACTIVE,
        variantActive: false,
        availableQuantity: 0,
        currentUnitPrice: 69000,
      }),
    ).toMatchObject({
      primaryStatus: CartItemStatus.BRANCH_INACTIVE,
      issues: [
        CartItemStatus.BRANCH_INACTIVE,
        CartItemStatus.PRODUCT_INACTIVE,
        CartItemStatus.VARIANT_INACTIVE,
        CartItemStatus.OUT_OF_STOCK,
        CartItemStatus.PRICE_CHANGED,
      ],
    });
  });
});
