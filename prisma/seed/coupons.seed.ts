import type { Prisma } from '../../src/generated/prisma/client';

export const COUPON_DEMO_FIXTURES = [
  ['BOOKORA10', 'ORDER', 'PERCENTAGE', 10, 300000, 40000, 'PUBLIC'],
  ['BOOKORA30', 'ORDER', 'FIXED_AMOUNT', 30000, 250000, null, 'PUBLIC'],
  ['BOOKORA20K', 'ORDER', 'FIXED_AMOUNT', 20000, 150000, null, 'PUBLIC'],
  ['BOOKORA50K', 'ORDER', 'FIXED_AMOUNT', 50000, 450000, null, 'PUBLIC'],
  ['BOOKORA70K', 'ORDER', 'FIXED_AMOUNT', 70000, 700000, null, 'PUBLIC'],
  ['BOOKORA5', 'ORDER', 'PERCENTAGE', 5, 100000, 25000, 'PUBLIC'],
  ['BOOKORA12', 'ORDER', 'PERCENTAGE', 12, 500000, 60000, 'PUBLIC'],
  ['BOOKORA15', 'ORDER', 'PERCENTAGE', 15, 900000, 100000, 'PUBLIC'],
  ['READMORE25', 'ORDER', 'FIXED_AMOUNT', 25000, 200000, null, 'PRIVATE'],
  ['WELCOMEBOOK', 'ORDER', 'PERCENTAGE', 8, 120000, 30000, 'PRIVATE'],
  ['SHIP20', 'SHIPPING', 'FIXED_AMOUNT', 20000, 200000, null, 'PUBLIC'],
  ['SHIP50', 'SHIPPING', 'FIXED_AMOUNT', 50000, 700000, null, 'PUBLIC'],
  ['SHIP10', 'SHIPPING', 'FIXED_AMOUNT', 10000, 100000, null, 'PUBLIC'],
  ['SHIP15', 'SHIPPING', 'FIXED_AMOUNT', 15000, 350000, null, 'PUBLIC'],
  ['SHIPMAX40', 'SHIPPING', 'PERCENTAGE', 100, 400000, 40000, 'PUBLIC'],
] as const;

export async function seedDemoCoupons(
  tx: Prisma.TransactionClient,
  now = new Date(),
): Promise<void> {
  for (const [
    code,
    type,
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscount,
    visibility,
  ] of COUPON_DEMO_FIXTURES) {
    await tx.coupon.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name:
          type === 'ORDER'
            ? `Ưu đãi mua sách ${code}`
            : `Ưu đãi vận chuyển ${code}`,
        type,
        discountType,
        discountValue,
        minOrderAmount,
        maxDiscount,
        visibility,
        usageLimit: 100,
        usageLimitPerUser: 1,
        isActive: true,
        startAt: new Date(now.getTime() - 60_000),
        endAt: new Date(now.getTime() + 90 * 86400_000),
      },
    });
  }
}
