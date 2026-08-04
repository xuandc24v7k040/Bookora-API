import {
  OrderHistoryEventType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@/generated/prisma/client';
import type { PrismaService } from '@/database/prisma.service';
import { CustomerOrderListTab } from './dto/customer-order.dto';
import { CustomerOrdersService } from './customer-orders.service';

const actor = {
  id: 'customer-1',
  type: 'CUSTOMER',
  fullName: 'Nguyễn An',
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
    note: null,
    placedAt: new Date('2026-07-24T02:00:00.000Z'),
    createdAt: new Date('2026-07-24T02:00:00.000Z'),
    cancelledAt: null,
    cancelReason: null,
    stockDeductedAt: new Date('2026-07-24T02:00:00.000Z'),
    stockRestoredAt: null,
    customerConfirmedReceivedAt: null,
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
  const reviewFindMany = jest.fn();
  const tx = {
    order: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    payment: { update: jest.fn() },
    paymentTransaction: { updateMany: jest.fn() },
    branchProductStock: {
      update: jest.fn().mockResolvedValue({ quantity: 10 }),
    },
    inventoryMovement: {
      create: jest.fn().mockResolvedValue({ id: 'movement-id' }),
    },
    orderStatusHistory: {
      create: jest.fn().mockResolvedValue({ id: 'status-history-id' }),
    },
  };
  const prisma = {
    order: {
      findMany: orderFindMany,
      count: orderCount,
      findFirst: jest.fn(),
    },
    review: { findMany: reviewFindMany },
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
    reviewFindMany,
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

  it('filters the shipping tab before pagination to unconfirmed SHIPPING orders', async () => {
    const { orderCount, orderFindMany, service } = createHarness();
    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(7);

    const result = await service.list(actor, {
      tab: CustomerOrderListTab.SHIPPING,
      page: 2,
      limit: 5,
    });

    const where = {
      userId: 'customer-1',
      status: OrderStatus.SHIPPING,
      customerConfirmedReceivedAt: null,
    };
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 5,
        take: 5,
      }),
    );
    expect(orderCount).toHaveBeenCalledWith({ where });
    expect(result).toMatchObject({
      page: 2,
      totalItems: 7,
      totalPages: 2,
    });
  });

  it('filters the received tab before pagination to confirmed SHIPPING and COMPLETED orders', async () => {
    const { orderCount, orderFindMany, service } = createHarness();
    orderFindMany.mockResolvedValue([]);
    orderCount.mockResolvedValue(4);

    await service.list(actor, {
      tab: CustomerOrderListTab.RECEIVED,
      page: 1,
      limit: 5,
    });

    const where = {
      userId: 'customer-1',
      OR: [
        {
          status: OrderStatus.SHIPPING,
          customerConfirmedReceivedAt: { not: null },
        },
        { status: OrderStatus.COMPLETED },
      ],
    };
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 5,
      }),
    );
    expect(orderCount).toHaveBeenCalledWith({ where });
  });

  it('derives WRITE, VIEW, and NONE from one batch review query with distinct products', async () => {
    const { orderCount, orderFindMany, reviewFindMany, service } =
      createHarness();
    orderFindMany.mockResolvedValue([
      order({
        id: 'order-write',
        status: OrderStatus.COMPLETED,
        items: [
          ...order().items,
          {
            ...order().items[0],
            id: 'item-2',
            variantId: 'variant-2',
            quantity: 3,
          },
          {
            ...order().items[0],
            id: 'item-3',
            productId: 'product-2',
            variantId: 'variant-3',
          },
        ],
      }),
      order({
        id: 'order-view',
        status: OrderStatus.COMPLETED,
        items: [
          ...order().items,
          {
            ...order().items[0],
            id: 'item-4',
            productId: 'product-2',
          },
        ],
      }),
      order({ id: 'order-shipping', status: OrderStatus.SHIPPING }),
    ]);
    orderCount.mockResolvedValue(3);
    reviewFindMany.mockResolvedValue([
      { orderId: 'order-write', productId: 'product-1' },
      { orderId: 'order-view', productId: 'product-1' },
      { orderId: 'order-view', productId: 'product-2' },
    ]);

    const result = await service.list(actor, { page: 1, limit: 5 });

    expect(reviewFindMany).toHaveBeenCalledTimes(1);
    expect(reviewFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'customer-1',
        orderId: { in: ['order-write', 'order-view'] },
      },
      select: { orderId: true, productId: true },
    });
    expect(result.items.map((item) => item.reviewAction)).toEqual([
      { type: 'WRITE', count: 1 },
      { type: 'VIEW', count: 2 },
      { type: 'NONE', count: 0 },
    ]);
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
    tx.order.findUniqueOrThrow.mockResolvedValue(cancelled);

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
      select: { quantity: true },
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          beforeQuantity: 8,
          quantityChange: 2,
          afterQuantity: 10,
          actorId: 'customer-1',
          sourceCode: 'BK-ORDER-1',
        }),
      }),
    );
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.orderStatusHistory.create).toHaveBeenCalledTimes(1);
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
    tx.order.findUniqueOrThrow.mockResolvedValue(cancelled);

    await service.cancel(actor, 'order-1');
    await service.cancel(actor, 'order-1');

    expect(tx.paymentTransaction.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.branchProductStock.update).toHaveBeenCalledTimes(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.orderStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { status: PaymentStatus.CANCELLED },
    });
    expect(tx).not.toHaveProperty('cartItem');
  });
});

describe('CustomerOrdersService receipt confirmation', () => {
  it('records one customer receipt event without changing status, payment, or inventory', async () => {
    const { prisma, tx, service } = createHarness();
    const shipping = order({ status: OrderStatus.SHIPPING });
    const confirmedAt = new Date('2026-07-27T15:00:00.000Z');
    const confirmed = order({
      status: OrderStatus.SHIPPING,
      customerConfirmedReceivedAt: confirmedAt,
    });
    tx.order.findFirst.mockResolvedValue(shipping);
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(confirmed);

    const result = await service.confirmReceived(actor, 'order-1');

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        userId: 'customer-1',
        status: OrderStatus.SHIPPING,
        customerConfirmedReceivedAt: null,
      },
      data: { customerConfirmedReceivedAt: expect.any(Date) },
    });
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        eventType: OrderHistoryEventType.CUSTOMER_RECEIPT_CONFIRMED,
        fromStatus: null,
        toStatus: null,
        actorUserId: 'customer-1',
        branchId: 'branch-1',
      }),
    });
    expect(result.status).toBe(OrderStatus.SHIPPING);
    expect(result.customerReceiptConfirmation).toEqual({
      confirmed: true,
      confirmedAt: confirmedAt.toISOString(),
    });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.branchProductStock.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('is idempotent after the receipt timestamp has already been set', async () => {
    const { prisma, tx, service } = createHarness();
    const confirmed = order({
      status: OrderStatus.SHIPPING,
      customerConfirmedReceivedAt: new Date('2026-07-27T15:00:00.000Z'),
    });
    tx.order.findFirst.mockResolvedValue(confirmed);
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(confirmed);

    await service.confirmReceived(actor, 'order-1');
    await service.confirmReceived(actor, 'order-1');

    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it.each([
    OrderStatus.PENDING,
    OrderStatus.PACKING,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
    OrderStatus.RETURNED,
  ])(
    'rejects receipt confirmation while order status is %s',
    async (status) => {
      const { tx, service } = createHarness();
      tx.order.findFirst.mockResolvedValue(order({ status }));

      await expect(
        service.confirmReceived(actor, 'order-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'ORDER_CONFIRM_RECEIVED_NOT_ALLOWED',
        }),
      });
      expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
    },
  );

  it('returns not found for an order owned by another customer', async () => {
    const { tx, service } = createHarness();
    tx.order.findFirst.mockResolvedValue(null);

    await expect(
      service.confirmReceived(actor, 'order-2'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_NOT_FOUND' }),
    });
  });

  it('treats a lost atomic claim as idempotent when another request confirmed first', async () => {
    const { prisma, tx, service } = createHarness();
    const shipping = order({ status: OrderStatus.SHIPPING });
    const confirmed = order({
      status: OrderStatus.SHIPPING,
      customerConfirmedReceivedAt: new Date('2026-07-27T15:00:00.000Z'),
    });
    tx.order.findFirst
      .mockResolvedValueOnce(shipping)
      .mockResolvedValueOnce(confirmed);
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    (prisma.order.findFirst as jest.Mock).mockResolvedValue(confirmed);

    await expect(
      service.confirmReceived(actor, 'order-1'),
    ).resolves.toMatchObject({ status: OrderStatus.SHIPPING });
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });
});
