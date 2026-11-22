import { Prisma, type MembershipTier } from '@/generated/prisma/client';

export const MEMBERSHIP_TIERS: readonly MembershipTier[] = [
  'BRONZE',
  'SILVER',
  'GOLD',
  'DIAMOND',
];
export const TIER_LABELS: Record<MembershipTier, string> = {
  BRONZE: 'Đồng',
  SILVER: 'Bạc',
  GOLD: 'Vàng',
  DIAMOND: 'Kim cương',
};
export const MAX_MEMBERSHIP_MONEY = 9_000_000_000_000_000;
export interface Thresholds {
  silver: Prisma.Decimal;
  gold: Prisma.Decimal;
  diamond: Prisma.Decimal;
}

export function eligibleTier(
  spend: Prisma.Decimal,
  config: Thresholds,
): MembershipTier {
  if (spend.gte(config.diamond)) return 'DIAMOND';
  if (spend.gte(config.gold)) return 'GOLD';
  if (spend.gte(config.silver)) return 'SILVER';
  return 'BRONZE';
}

export function higherTier(
  current: MembershipTier,
  candidate: MembershipTier,
): MembershipTier {
  return MEMBERSHIP_TIERS.indexOf(candidate) > MEMBERSHIP_TIERS.indexOf(current)
    ? candidate
    : current;
}

export function allowedTiers(tier: MembershipTier): MembershipTier[] {
  return MEMBERSHIP_TIERS.slice(0, MEMBERSHIP_TIERS.indexOf(tier) + 1);
}

/** Uses frozen merchandise allocations; catalog/flash discounts are already in lineTotal. */
export function qualifiedMerchandise(order: {
  subtotalAmount: Prisma.Decimal;
  orderCouponDiscountAmount: Prisma.Decimal;
  items: Array<{
    lineTotal: Prisma.Decimal;
    couponDiscountAmount: Prisma.Decimal;
  }>;
}): Prisma.Decimal {
  const net = order.subtotalAmount.sub(order.orderCouponDiscountAmount);
  const subtotal = order.items.reduce(
    (sum, item) => sum.add(item.lineTotal),
    new Prisma.Decimal(0),
  );
  const allocated = order.items.reduce((sum, item) => {
    const amount = item.lineTotal.sub(item.couponDiscountAmount);
    if (amount.lt(0) || !amount.isInteger())
      throw new Error('MEMBERSHIP_INVALID_ITEM_SNAPSHOT');
    return sum.add(amount);
  }, new Prisma.Decimal(0));
  if (
    !order.items.length ||
    !subtotal.eq(order.subtotalAmount) ||
    !net.eq(allocated) ||
    net.lt(0) ||
    !net.isInteger() ||
    net.gt(MAX_MEMBERSHIP_MONEY)
  )
    throw new Error('MEMBERSHIP_INVALID_MONEY_SNAPSHOT');
  return net;
}
