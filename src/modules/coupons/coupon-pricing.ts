import { Prisma, type Coupon } from '@/generated/prisma/client';

export function couponRuleVersion(coupon: Coupon): string {
  return JSON.stringify([
    coupon.id,
    coupon.code,
    coupon.type,
    coupon.visibility,
    coupon.discountType,
    coupon.discountValue,
    coupon.minOrderAmount,
    coupon.maxDiscount,
    coupon.usageLimit,
    coupon.usageLimitPerUser,
    coupon.startAt,
    coupon.endAt,
    coupon.isActive,
    coupon.updatedAt,
  ]);
}

/** Money is rounded down to whole VND exactly once; never multiply JS floats. */
export function couponDiscount(coupon: Coupon, base: number): number {
  const amount =
    coupon.discountType === 'PERCENTAGE'
      ? new Prisma.Decimal(base).mul(coupon.discountValue).div(100).floor()
      : coupon.discountValue.floor();
  return Math.max(
    0,
    Math.min(
      base,
      amount.toNumber(),
      coupon.maxDiscount === null ? base : coupon.maxDiscount.toNumber(),
    ),
  );
}

/** Largest remainder allocation; source id is the stable tie-break, independent of cart order. */
export function allocateCouponDiscount(
  items: ReadonlyArray<{ id: string; lineTotal: number }>,
  discount: number,
): Map<string, number> {
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (
    !Number.isSafeInteger(discount) ||
    discount < 0 ||
    discount > total ||
    items.some(
      (item) => !Number.isSafeInteger(item.lineTotal) || item.lineTotal < 0,
    )
  ) {
    throw new RangeError('Invalid VND coupon allocation');
  }
  if (total === 0) return new Map(items.map(({ id }) => [id, 0]));
  const denominator = BigInt(total);
  const rows = items
    .map((item) => {
      const numerator = BigInt(item.lineTotal) * BigInt(discount);
      return {
        id: item.id,
        amount: Number(numerator / denominator),
        remainder: numerator % denominator,
      };
    })
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.id.localeCompare(b.id)
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  const remaining = discount - rows.reduce((sum, row) => sum + row.amount, 0);
  rows.forEach((row, index) => {
    if (index < remaining) row.amount += 1;
  });
  return new Map(rows.map((row) => [row.id, row.amount]));
}
