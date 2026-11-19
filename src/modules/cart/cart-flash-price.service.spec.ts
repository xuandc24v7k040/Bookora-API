import { CartFlashPriceService } from './cart-flash-price.service';
import type { PrismaService } from '@/database/prisma.service';
describe('Cart Flash Sale batch estimates', () => {
  it('quotes many variants with three read queries and active usage; excludes exhausted personal/global quota', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'i1',
        variantId: 'v1',
        flashPrice: 60000,
        totalQuota: 5,
        maxQuantityPerUser: 3,
      },
      {
        id: 'i2',
        variantId: 'v2',
        flashPrice: 70000,
        totalQuota: 2,
        maxQuantityPerUser: 2,
      },
    ]);
    const groupBy = jest
      .fn()
      .mockResolvedValueOnce([
        { flashSaleItemId: 'i1', _sum: { quantity: 2 } },
        { flashSaleItemId: 'i2', _sum: { quantity: 2 } },
      ])
      .mockResolvedValueOnce([
        { flashSaleItemId: 'i1', _sum: { quantity: 2 } },
      ]);
    const prisma = {
      flashSaleItem: { findMany },
      flashSaleAllocation: { groupBy },
    } as unknown as PrismaService;
    const result = await new CartFlashPriceService(prisma).quote(
      ['v1', 'v2'],
      'user',
    );
    expect(result.get('v1')).toEqual({ price: 60000, allowed: 1 });
    expect(result.get('v2')).toEqual({ price: 70000, allowed: 0 });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          flashSale: expect.objectContaining({ state: 'PUBLISHED' }),
        }),
      }),
    );
    expect(groupBy.mock.calls[1][0].where.userId).toBe('user');
  });
  it('skips all queries for an empty cart', async () => {
    const service = new CartFlashPriceService({} as PrismaService);
    expect((await service.quote([], 'user')).size).toBe(0);
  });
});
