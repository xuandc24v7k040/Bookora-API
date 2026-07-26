import { InventoryRepository } from './inventory.repository';
import { InventoryAdjustmentDirection } from './dto';

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

describe('InventoryRepository manual adjustment', () => {
  function harness(currentQuantity: number | null) {
    const tx = {
      branch: {
        findUnique: jest.fn().mockResolvedValue({ code: 'CT', isActive: true }),
      },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: true,
          product: { status: 'ACTIVE' },
        }),
      },
      branchProductStock: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            currentQuantity === null
              ? null
              : { id: 'stock-1', quantity: currentQuantity },
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      stockReceipt: { create: jest.fn().mockResolvedValue({}) },
      inventoryMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    return { tx, repository: new InventoryRepository(prisma as never) };
  }

  it('creates the adjustment document, stock change and movement atomically', async () => {
    const { tx, repository } = harness(12);

    await expect(
      repository.adjustQuantity('branch-1', 'variant-1', 'actor-1', {
        expectedCurrentQuantity: 12,
        direction: InventoryAdjustmentDirection.DECREASE,
        quantity: 2,
        note: 'Kiểm kê thực tế',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        beforeQuantity: 12,
        quantityChange: -2,
        afterQuantity: 10,
        movementId: 'movement-1',
      }),
    );
    expect(tx.stockReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ADJUSTMENT',
          status: 'CONFIRMED',
          items: { create: expect.objectContaining({ quantity: -2 }) },
        }),
      }),
    );
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          beforeQuantity: 12,
          quantityChange: -2,
          afterQuantity: 10,
          actorId: 'actor-1',
        }),
      }),
    );
  });

  it('rejects a stale expected quantity before writing anything', async () => {
    const { tx, repository } = harness(13);

    await expect(
      repository.adjustQuantity('branch-1', 'variant-1', 'actor-1', {
        expectedCurrentQuantity: 12,
        direction: InventoryAdjustmentDirection.INCREASE,
        quantity: 2,
        note: 'Bổ sung số dư đầu kỳ',
      }),
    ).rejects.toMatchObject({
      code: 'INVENTORY_QUANTITY_CHANGED',
      details: { currentQuantity: 13 },
    });
    expect(tx.stockReceipt.create).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('allows a missing stock row to increase from zero', async () => {
    const { tx, repository } = harness(null);

    await repository.adjustQuantity('branch-1', 'variant-1', 'actor-1', {
      expectedCurrentQuantity: 0,
      direction: InventoryAdjustmentDirection.INCREASE,
      quantity: 5,
      note: 'Số dư ban đầu',
    });

    expect(tx.branchProductStock.create).toHaveBeenCalledWith({
      data: { branchId: 'branch-1', variantId: 'variant-1', quantity: 5 },
    });
  });
});
