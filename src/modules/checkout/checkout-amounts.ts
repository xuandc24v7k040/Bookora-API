import type { ResolvedCoupon } from '@/modules/coupons/coupons.service';

/** The existing checkout formula, shared with COD quote convergence; no provider-specific discount rules. */
export function checkoutAmounts(
  subtotalAmount: number,
  shippingFee: number | null,
  coupons: readonly ResolvedCoupon[],
) {
  const orderCouponDiscountAmount =
    coupons.find(({ coupon }) => coupon.type === 'ORDER')?.discountAmount ?? 0;
  const shippingCouponDiscountAmount =
    coupons.find(({ coupon }) => coupon.type === 'SHIPPING')?.discountAmount ??
    0;
  return {
    orderCouponDiscountAmount,
    shippingCouponDiscountAmount,
    totalAmount:
      subtotalAmount -
      orderCouponDiscountAmount +
      (shippingFee ?? 0) -
      shippingCouponDiscountAmount,
  };
}
