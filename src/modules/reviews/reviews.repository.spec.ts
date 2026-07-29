import { ReviewsRepository } from './reviews.repository';

describe('ReviewsRepository public reviews pagination', () => {
  it('uses the requested page size with the same visible-review summary predicate', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const aggregate = jest
      .fn()
      .mockResolvedValue({ _count: { _all: 0 }, _avg: { rating: null } });
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = {
      review: { findMany, count, aggregate, groupBy },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const repository = new ReviewsRepository(prisma as never);

    const result = await repository.listPublic('product-1', {
      page: 2,
      limit: 4,
      rating: 5,
      verifiedPurchase: true,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId: 'product-1',
          isVisible: true,
          rating: 5,
          id: undefined,
        },
        skip: 4,
        take: 4,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        isVisible: true,
        rating: 5,
        id: undefined,
      },
    });
    expect(aggregate).toHaveBeenCalledWith({
      where: { productId: 'product-1', isVisible: true },
      _count: { _all: true },
      _avg: { rating: true },
    });
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 'product-1', isVisible: true },
      }),
    );
    expect(result.pageSize).toBe(4);
  });
});
