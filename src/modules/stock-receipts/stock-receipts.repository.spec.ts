import { ProductStatus, StockReceiptStatus } from '@/generated/prisma/client';
import type { PrismaService } from '@/database/prisma.service';
import {
  StockReceiptDomainError,
  StockReceiptsRepository,
  type StockReceiptRecord,
} from './stock-receipts.repository';

function receipt(
  status: StockReceiptStatus = StockReceiptStatus.DRAFT,
): StockReceiptRecord {
  const now = new Date('2026-07-22T00:00:00.000Z');
  const variant = (id: string) => ({
    id,
    productId: 'product-id',
    name: id,
    sku: id,
    barcode: null,
    isDefault: id === 'variant-a',
    isActive: true,
    product: {
      name: 'Sản phẩm',
      status: ProductStatus.ACTIVE,
      media: [],
    },
    media: [],
    optionValues: [],
  });
  return {
    id: 'receipt-id',
    branchId: 'branch-id',
    supplierId: null,
    code: 'PNK-CT-202607-TEST',
    status,
    note: null,
    createdAt: now,
    updatedAt: now,
    confirmedAt: status === StockReceiptStatus.CONFIRMED ? now : null,
    branch: { id: 'branch-id', name: 'Cần Thơ', code: 'CT', isActive: true },
    supplier: null,
    createdBy: null,
    confirmedBy: null,
    items: [
      {
        id: 'item-a',
        variantId: 'variant-a',
        quantity: 7,
        costPrice: null,
        variant: variant('variant-a'),
      },
      {
        id: 'item-b',
        variantId: 'variant-b',
        quantity: 11,
        costPrice: null,
        variant: variant('variant-b'),
      },
    ],
  };
}

function setup(record: StockReceiptRecord) {
  const tx = {
    stockReceipt: {
      findFirst: jest.fn().mockResolvedValue(record),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ ...record, status: StockReceiptStatus.CONFIRMED }),
    },
    branchProductStock: { upsert: jest.fn().mockResolvedValue({}) },
    supplier: { count: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  return {
    tx,
    repository: new StockReceiptsRepository(prisma as unknown as PrismaService),
  };
}

describe('StockReceiptsRepository confirm transaction', () => {
  it('transitions once and increments every item in the same transaction', async () => {
    const { repository, tx } = setup(receipt());
    await repository.confirm('branch-id', 'receipt-id', 'actor-id');

    expect(tx.stockReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: StockReceiptStatus.DRAFT }),
      }),
    );
    expect(tx.branchProductStock.upsert).toHaveBeenCalledTimes(2);
    expect(tx.branchProductStock.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ update: { quantity: { increment: 7 } } }),
    );
  });

  it('does not touch stock when the receipt was already confirmed', async () => {
    const { repository, tx } = setup(receipt(StockReceiptStatus.CONFIRMED));
    await expect(
      repository.confirm('branch-id', 'receipt-id', 'actor-id'),
    ).rejects.toMatchObject({ code: 'STOCK_RECEIPT_ALREADY_CONFIRMED' });
    expect(tx.stockReceipt.updateMany).not.toHaveBeenCalled();
    expect(tx.branchProductStock.upsert).not.toHaveBeenCalled();
  });

  it('validates all items before the state transition or stock increment', async () => {
    const invalid = receipt();
    invalid.items[1].variant.product.status = ProductStatus.INACTIVE;
    const { repository, tx } = setup(invalid);
    await expect(
      repository.confirm('branch-id', 'receipt-id', 'actor-id'),
    ).rejects.toBeInstanceOf(StockReceiptDomainError);
    expect(tx.stockReceipt.updateMany).not.toHaveBeenCalled();
    expect(tx.branchProductStock.upsert).not.toHaveBeenCalled();
  });
});
