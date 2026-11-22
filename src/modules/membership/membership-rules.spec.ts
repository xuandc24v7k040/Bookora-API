import { Prisma } from '@/generated/prisma/client';
import {
  eligibleTier,
  higherTier,
  qualifiedMerchandise,
} from './membership-rules';

const d = (n: number) => new Prisma.Decimal(n);
const config = { silver: d(2000000), gold: d(5000000), diamond: d(10000000) };
describe('membership money and permanent tiers', () => {
  it.each([
    [1999999, 'BRONZE'],
    [2000000, 'SILVER'],
    [4999999, 'SILVER'],
    [5000000, 'GOLD'],
    [9999999, 'GOLD'],
    [10000000, 'DIAMOND'],
  ] as const)('spend %i yields %s', (amount, tier) =>
    expect(eligibleTier(d(amount), config)).toBe(tier),
  );
  it('keeps a permanently achieved tier', () =>
    expect(higherTier('GOLD', 'BRONZE')).toBe('GOLD'));
  it('uses net frozen merchandise and ignores shipping/catalog discounts already allocated', () => {
    expect(
      qualifiedMerchandise({
        subtotalAmount: d(175000),
        orderCouponDiscountAmount: d(25000),
        items: [
          { lineTotal: d(100000), couponDiscountAmount: d(14286) },
          { lineTotal: d(75000), couponDiscountAmount: d(10714) },
        ],
      }).toNumber(),
    ).toBe(150000);
  });
  it.each([
    [-1, 0],
    [100, 101],
    [100.5, 0],
  ])('rejects unsafe item snapshots %i / %i', (line, discount) => {
    expect(() =>
      qualifiedMerchandise({
        subtotalAmount: d(line),
        orderCouponDiscountAmount: d(discount),
        items: [{ lineTotal: d(line), couponDiscountAmount: d(discount) }],
      }),
    ).toThrow();
  });
  it('rejects header/line disagreement instead of silently clamping', () => {
    expect(() =>
      qualifiedMerchandise({
        subtotalAmount: d(100),
        orderCouponDiscountAmount: d(0),
        items: [{ lineTotal: d(99), couponDiscountAmount: d(0) }],
      }),
    ).toThrow();
  });
});
