import { InventoryRepository } from './inventory.repository';

describe('InventoryRepository variant selector', () => {
  it('paginates products and returns every active variant in each product group', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: 'product-1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
      productVariant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'variant-1', productId: 'product-1' },
          { id: 'variant-2', productId: 'product-1' },
        ]),
      },
    };
    const repository = new InventoryRepository(prisma as never);

    const [variants, total] = await repository.listVariantOptions(
      'blue',
      10,
      5,
    );

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5, select: { id: true } }),
    );
    expect(prisma.productVariant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: { in: ['product-1'] }, isActive: true },
      }),
    );
    expect(variants).toHaveLength(2);
    expect(total).toBe(1);
  });

  it('does not query variants when the product page is empty', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      productVariant: { findMany: jest.fn() },
    };
    const repository = new InventoryRepository(prisma as never);

    await expect(
      repository.listVariantOptions(undefined, 0, 20),
    ).resolves.toEqual([[], 0]);
    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
  });
});
