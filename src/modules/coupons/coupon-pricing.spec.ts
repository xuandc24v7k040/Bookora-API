import { Prisma, type Coupon } from '@/generated/prisma/client';
import { allocateCouponDiscount, couponDiscount } from './coupon-pricing';

describe('Coupon integer VND pricing', () => {
  const rule = (overrides: Partial<Coupon> = {}) =>
    ({
      discountType: 'PERCENTAGE',
      discountValue: new Prisma.Decimal(10),
      maxDiscount: new Prisma.Decimal(40_000),
      ...overrides,
    }) as Coupon;
  it('preserves sale pricing and produces approved example totals', () => {
    expect(500_000 - couponDiscount(rule(), 500_000) + 30_000 - 20_000).toBe(
      470_000,
    );
    expect(
      72_000 -
        couponDiscount(
          rule({
            discountType: 'FIXED_AMOUNT',
            discountValue: new Prisma.Decimal(5000),
          }),
          72_000,
        ),
    ).toBe(67_000);
  });
  it('clamps shipping, fixed discounts and caps, including zero shipping', () => {
    const shipping = rule({
      discountType: 'FIXED_AMOUNT',
      discountValue: new Prisma.Decimal(50_000),
      maxDiscount: null,
    });
    expect(couponDiscount(shipping, 30_000)).toBe(30_000);
    expect(couponDiscount(shipping, 0)).toBe(0);
    expect(couponDiscount(rule(), 1_000_000)).toBe(40_000);
    expect(
      couponDiscount(
        rule({ discountValue: new Prisma.Decimal('12.34'), maxDiscount: null }),
        101,
      ),
    ).toBe(12);
  });
  it('allocates odd remainders deterministically regardless of item order and quantity', () => {
    const rows = [
      { id: 'c', lineTotal: 3 },
      { id: 'b', lineTotal: 3 },
      { id: 'a', lineTotal: 3 },
    ];
    expect(Object.fromEntries(allocateCouponDiscount(rows, 2))).toEqual({
      a: 1,
      b: 1,
      c: 0,
    });
    expect(allocateCouponDiscount([...rows].reverse(), 2)).toEqual(
      allocateCouponDiscount(rows, 2),
    );
    for (let discount = 0; discount <= 9; discount++) {
      const values = [...allocateCouponDiscount(rows, discount).values()];
      expect(values.reduce((a, b) => a + b, 0)).toBe(discount);
      expect(values.every((value) => value >= 0 && value <= 3)).toBe(true);
    }
  });
  it('uses exact arithmetic for large products and rejects unsafe inputs', () => {
    const result = allocateCouponDiscount(
      [
        { id: 'a', lineTotal: 9_000_000_001 },
        { id: 'b', lineTotal: 1 },
      ],
      8_000_000_001,
    );
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(8_000_000_001);
    expect(() =>
      allocateCouponDiscount([{ id: 'a', lineTotal: 10 }], NaN),
    ).toThrow();
    expect(() =>
      allocateCouponDiscount([{ id: 'a', lineTotal: 10 }], -1),
    ).toThrow();
  });
});
