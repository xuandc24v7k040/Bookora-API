import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@/generated/prisma/client';
import type { PrismaService } from '@/database/prisma.service';
import { CustomerOrdersService } from './customer-orders.service';

const actor = {
  id: 'customer-1',
  type: 'CUSTOMER',
} as never;

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    orderCode: 'BK-ORDER-1',
    userId: 'customer-1',
    branchId: 'branch-1',
    branchNameSnapshot: 'Chi nhánh Hà Nội',
    status: OrderStatus.PENDING,
    subtotalAmount: 100_000,
    discountAmount: 0,
    shippingFee: 15_000,
    totalAmount: 115_000,
    receiverName: 'Nguyễn An',
    receiverPhone: '0900000000',
    shippingAddress: 'Hà Nội',
    shippingServiceName: 'Giao hàng tiêu chuẩn',
    note: null,
    placedAt: new Date('2026-07-24T02:00:00.000Z'),
    createdAt: new Date('2026-07-24T02:00:00.000Z'),
    cancelledAt: null,
    cancelReason: null,
    stockDeductedAt: new Date('2026-07-24T02:00:00.000Z'),
    stockRestoredAt: null,
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        variantId: 'variant-1',
        productName: 'Sách kiểm thử',
        productSlug: 'sach-kiem-thu',
        variantLabel: 'Mặc định',
        variantOptions: [],
        imageUrl: null,
        quantity: 2,
        unitPrice: 50_000,
        lineTotal: 100_000,
      },
    ],
    payment: {
      id: 'payment-1',
      method: PaymentMethod.COD,
      status: PaymentStatus.UNPAID,
      transactions: [],
    },
    ...overrides,
  };
}

function createHarness() {
  const orderFindMany = jest.fn();
  const orderCount = jest.fn();
  const tx = {
    order: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    payment: { update: jest.fn() },
    paymentTransaction: { updateMany: jest.fn() },
    branchProductStock: { update: jest.fn() },
  };
  const prisma = {
    order: {
      findMany: orderFindMany,
      count: orderCount,
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((input: unknown) =>
      Array.isArray(input)
        ? Promise.all(input)
        : (input as (client: typeof tx) => Promise<unknown>)(tx),
    ),
  } as unknown as PrismaService;
  return {
    tx,
    prisma,
    orderCount,
    orderFindMany,
    service: new CustomerOrdersService(prisma),
  };
}

describe('CustomerOrdersService list', () => {
  it.each(Object.values(OrderStatus))(
    'filters customer-owned orders by %s',
    async (status) => {
      const { orderCount, orderFindMany, service } = createHarness();
      orderFindMany.mockResolvedValue([]);
      orderCount.mockResolvedValue(0);

      await service.list(actor, { status: [status], page: 1, limit: 5 });

      expect(orderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'customer-1', status: { in: [status] } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: 0,
          take: 5,
        }),
      );
      expect(orderCount).toHaveBeenCalledWith({
        where: { userId: 'customer-1', status: { in: [status] } },
      });
    },
  );

  it('uses non-overlapping server pages and returns exact totals', async () => {
    const { orderCount, orderFindMany, service } = createHarness();
    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(12);

    const result = await service.list(actor, { page: 2, limit: 5 });

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
    expect(result).toEqual({
      items: [],
      page: 2,
      limit: 5,
      totalItems: 12,
      totalPages: 3,
    });
  });
});

describe('CustomerOrdersService cancellation lifecycle', () => {
  it('restores COD stock once and never restores Cart items', async () => {
    const { tx, service } = createHarness();
    const current = order();
    const cancelled = order({
      status: OrderStatus.CANCELLED,
      stockRestoredAt: new Date('2026-07-24T03:00:00.000Z'),
    });
    tx.order.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(cancelled);
    tx.order.update.mockResolvedValue(cancelled);

    await service.cancel(actor, 'order-1');
    await service.cancel(actor, 'order-1');

    expect(tx.branchProductStock.update).toHaveBeenCalledTimes(1);
    expect(tx.branchProductStock.update).toHaveBeenCalledWith({
      where: {
        branchId_variantId: {
          branchId: 'branch-1',
          variantId: 'variant-1',
        },
      },
      data: { quantity: { increment: 2 } },
    });
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    expect(tx).not.toHaveProperty('cartItem');
  });

  it('releases a VNPAY reservation once only after Bookora order cancellation', async () => {
    const { tx, service } = createHarness();
    const current = order({
      status: OrderStatus.PENDING_PAYMENT,
      stockDeductedAt: null,
      payment: {
        id: 'payment-1',
        method: PaymentMethod.VNPAY,
        status: PaymentStatus.PENDING,
        transactions: [
          {
            id: 'transaction-1',
            stockReservedAt: new Date('2026-07-24T02:00:00.000Z'),
            stockReleasedAt: null,
            stockConsumedAt: null,
            createdAt: new Date('2026-07-24T02:00:00.000Z'),
          },
        ],
      },
    });
    const cancelled = order({
      ...current,
      status: OrderStatus.CANCELLED,
      stockRestoredAt: new Date('2026-07-24T03:00:00.000Z'),
    });
    tx.order.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(cancelled);
    tx.paymentTransaction.updateMany.mockResolvedValue({ count: 1 });
    tx.order.update.mockResolvedValue(cancelled);

    await service.cancel(actor, 'order-1');
    await service.cancel(actor, 'order-1');

    expect(tx.paymentTransaction.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.branchProductStock.update).toHaveBeenCalledTimes(1);
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { status: PaymentStatus.CANCELLED },
    });
    expect(tx).not.toHaveProperty('cartItem');
  });
});
