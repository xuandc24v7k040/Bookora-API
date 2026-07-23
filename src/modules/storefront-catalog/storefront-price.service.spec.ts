import { Prisma } from '@/generated/prisma/client';
import { StorefrontPriceService } from './storefront-price.service';

describe('StorefrontPriceService', () => {
  const service = new StorefrontPriceService();
  const now = new Date('2026-07-23T00:00:00.000Z');
  const base = {
    originalPrice: new Prisma.Decimal(100_000),
    salePrice: new Prisma.Decimal(75_000),
    saleStartAt: new Date('2026-07-01T00:00:00.000Z'),
    saleEndAt: new Date('2026-08-01T00:00:00.000Z'),
  };

  it('resolves an active scheduled sale and its discount', () => {
    expect(service.resolve(base, now)).toEqual({
      current: 75_000,
      original: 100_000,
      onSale: true,
      discountPercent: 25,
    });
  });

  it.each([
    ['without sale price', { ...base, salePrice: null }],
    [
      'before the sale starts',
      { ...base, saleStartAt: new Date('2026-08-01T00:00:00.000Z') },
    ],
    [
      'after the sale ends',
      { ...base, saleEndAt: new Date('2026-07-23T00:00:00.000Z') },
    ],
    [
      'with a non-discounted sale price',
      { ...base, salePrice: new Prisma.Decimal(100_000) },
    ],
  ])('uses the original price %s', (_label, input) => {
    expect(service.resolve(input, now)).toMatchObject({
      current: 100_000,
      original: 100_000,
      onSale: false,
      discountPercent: 0,
    });
  });

  it('supports an open-ended sale schedule', () => {
    expect(
      service.resolve({ ...base, saleStartAt: null, saleEndAt: null }, now),
    ).toMatchObject({ current: 75_000, onSale: true });
  });
});
