import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  OrderHistoryEventType,
  OrderStatus,
  OrderStatusActorType,
  PaymentMethod,
  PaymentStatus,
  UserType,
} from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { BranchContext } from '@/modules/authorization';
import { AdminOrdersService } from './admin-orders.service';
import type { AdminOrdersRepository } from './admin-orders.repository';

const branchContext = {
  scope: 'SELECTED',
  selectedBranchId: 'branch-1',
} as BranchContext;

function actor(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'admin-1',
    email: 'admin@bookora.vn',
    fullName: 'Quản lý Bookora',
    phone: null,
    gender: null,
    birthday: null,
    avatarUrl: null,
    type: UserType.BRANCH,
    roles: [
      {
        id: 'role-1',
        code: 'BRANCH_ADMIN',
        level: 20,
        type: UserType.BRANCH,
        isSystem: true,
      },
    ],
    permissions: [
      'orders.read',
      'orders.update_status',
      'orders.cancel',
      'orders.update_note',
    ],
    globalRoles: [],
    globalPermissions: [],
    branchAssignments: [],
    allowedBranchIds: ['branch-1'],
    branches: [],
    primaryBranchId: 'branch-1',
    maxRoleLevel: 20,
    isSuperAdmin: false,
    sessionId: 'session-1',
    ...overrides,
  };
}

function orderFixture(status: OrderStatus = OrderStatus.PACKING) {
  const now = new Date('2026-07-27T08:00:00.000Z');
  return {
    id: 'order-1',
    orderCode: 'BK-ORDER-1',
    userId: 'customer-1',
    branchId: 'branch-1',
    branchNameSnapshot: 'Bookora Ninh Kiều',
    branchAddressSnapshot: 'Cần Thơ',
    status,
    subtotalAmount: 100_000,
    discountAmount: 0,
    shippingFee: 15_000,
    totalAmount: 115_000,
    receiverName: 'Nguyễn An',
    receiverPhone: '0900000000',
    shippingAddress: 'Ninh Kiều, Cần Thơ',
    shippingServiceName: 'Giao hàng tiêu chuẩn',
    shippingProviderSnapshot: null,
    estimatedDeliveryAt: null,
    note: null,
    internalNote: null,
    internalNoteUpdatedAt: null,
    cancelledAt: null,
    cancelReason: null,
    placedAt: now,
    createdAt: now,
    stockDeductedAt: now,
    stockRestoredAt: null,
    customerConfirmedReceivedAt: null as Date | null,
    user: {
      id: 'customer-1',
      fullName: 'Nguyễn An',
      email: 'customer@bookora.vn',
      phone: '0900000000',
    },
    branch: { id: 'branch-1', name: 'Bookora Ninh Kiều', address: 'Cần Thơ' },
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        variantId: 'variant-1',
        productName: 'Sách kiểm thử',
        productSlug: 'sach-kiem-thu',
        variantLabel: 'Mặc định',
        variantOptions: {},
        imageUrl: null,
        sku: 'BOOK-001',
        quantity: 2,
        unitPrice: 50_000,
        originalPrice: 50_000,
        discountAmount: 0,
        lineTotal: 100_000,
      },
    ],
    payment: {
      id: 'payment-1',
      method: PaymentMethod.COD,
      status: PaymentStatus.UNPAID,
      amount: 115_000,
      currency: 'VND',
      paidAt: null,
      createdAt: now,
      transactions: [],
    },
    statusHistories: [] as Array<Record<string, unknown>>,
  };
}

function createHarness(initialOrder = orderFixture()) {
  let currentOrder = initialOrder;
  const tx = {
    payment: { update: jest.fn().mockResolvedValue({}) },
    paymentTransaction: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    branchProductStock: {
      update: jest.fn().mockResolvedValue({ quantity: 12 }),
    },
    inventoryMovement: {
      create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
    },
    order: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderStatusHistory: {
      create: jest.fn().mockImplementation(({ data }) => {
        currentOrder = {
          ...currentOrder,
          statusHistories: [
            ...currentOrder.statusHistories,
            { id: 'history-1', ...data, branch: { name: 'Bookora Ninh Kiều' } },
          ],
        };
        return { id: 'history-1' };
      }),
    },
  };
  const transition = jest
    .fn()
    .mockImplementation((_tx, _id, _from, targetStatus) => {
      currentOrder = { ...currentOrder, status: targetStatus };
      return Promise.resolve(true);
    });
  const transaction = jest.fn((operation) => operation(tx));
  const repository = {
    list: jest.fn().mockResolvedValue({
      items: [currentOrder],
      total: 1,
      page: 1,
      limit: 10,
    }),
    detail: jest.fn().mockImplementation(() => Promise.resolve(currentOrder)),
    findCancellable: jest
      .fn()
      .mockImplementation(() => Promise.resolve(currentOrder)),
    transition,
    transaction,
  } as unknown as jest.Mocked<AdminOrdersRepository>;
  return {
    repository,
    service: new AdminOrdersService(repository),
    transaction,
    transition,
    tx,
  };
}

describe('AdminOrdersService', () => {
  it('projects customer receipt confirmation on list items', async () => {
    const confirmedOrder = {
      ...orderFixture(OrderStatus.SHIPPING),
      customerConfirmedReceivedAt: new Date('2026-07-27T09:00:00.000Z'),
    };
    const { repository, service } = createHarness(confirmedOrder);

    const result = await service.list(branchContext, { page: 1, limit: 10 });

    expect(repository.list.mock.calls).toContainEqual([
      'branch-1',
      { page: 1, limit: 10 },
    ]);
    expect(result.data[0]).toMatchObject({
      id: 'order-1',
      status: OrderStatus.SHIPPING,
      customerReceiptConfirmed: true,
    });
  });

  it('keeps Super Admin read-only even when the global guard is bypassed', async () => {
    const { service, transaction } = createHarness();

    await expect(
      service.transition(
        actor({ isSuperAdmin: true }),
        branchContext,
        'order-1',
        { targetStatus: OrderStatus.SHIPPING },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('transitions only to the next state and appends an ADMIN history event', async () => {
    const { service, transition, tx } = createHarness();

    const result = await service.transition(actor(), branchContext, 'order-1', {
      targetStatus: OrderStatus.SHIPPING,
      note: 'Bàn giao cho đơn vị vận chuyển',
    });

    expect(transition).toHaveBeenCalledWith(
      expect.anything(),
      'order-1',
      OrderStatus.PACKING,
      OrderStatus.SHIPPING,
    );
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: OrderStatus.PACKING,
        toStatus: OrderStatus.SHIPPING,
        actorType: OrderStatusActorType.ADMIN,
        actorUserId: 'admin-1',
        branchId: 'branch-1',
      }),
    });
    expect(result.status).toBe(OrderStatus.SHIPPING);
  });

  it('marks an unpaid COD payment as paid when shipping is completed', async () => {
    const { service, tx } = createHarness({
      ...orderFixture(OrderStatus.SHIPPING),
      customerConfirmedReceivedAt: new Date('2026-07-27T09:00:00.000Z'),
    });

    await service.transition(actor(), branchContext, 'order-1', {
      targetStatus: OrderStatus.COMPLETED,
    });

    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { status: PaymentStatus.PAID, paidAt: expect.any(Date) },
    });
  });

  it('rejects completion until the customer has confirmed receipt', async () => {
    const { service, transition, tx } = createHarness(
      orderFixture(OrderStatus.SHIPPING),
    );

    await expect(
      service.transition(actor(), branchContext, 'order-1', {
        targetStatus: OrderStatus.COMPLETED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transition).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it('projects customer receipt event and completion readiness', async () => {
    const confirmedAt = new Date('2026-07-27T09:00:00.000Z');
    const fixture = {
      ...orderFixture(OrderStatus.SHIPPING),
      customerConfirmedReceivedAt: confirmedAt,
      statusHistories: [
        {
          id: 'receipt-1',
          eventType: OrderHistoryEventType.CUSTOMER_RECEIPT_CONFIRMED,
          fromStatus: null,
          toStatus: null,
          actorType: OrderStatusActorType.CUSTOMER,
          actorUserId: 'customer-1',
          actorDisplayNameSnapshot: 'Nguyễn An',
          actorRoleSnapshot: 'CUSTOMER',
          branchId: 'branch-1',
          reason: null,
          note: 'Khách hàng xác nhận đã nhận đủ sản phẩm.',
          createdAt: confirmedAt,
          branch: { name: 'Bookora Ninh Kiều' },
        },
      ],
    };
    const { service } = createHarness(fixture);

    const result = await service.detail(actor(), branchContext, 'order-1');

    expect(result.customerReceiptConfirmation).toEqual({
      confirmed: true,
      confirmedAt: confirmedAt.toISOString(),
      confirmedByName: 'Nguyễn An',
    });
    expect(result.completionReadiness).toEqual({
      ready: true,
      reasonCode: null,
    });
    expect(result.allowedActions.complete).toBe(true);
    expect(result.history[0]).toMatchObject({
      eventType: OrderHistoryEventType.CUSTOMER_RECEIPT_CONFIRMED,
      toStatus: null,
    });
  });

  it('derives actions from status, permission, and Super Admin read-only policy', async () => {
    const { service } = createHarness();

    const branchAdmin = await service.detail(actor(), branchContext, 'order-1');
    const superAdmin = await service.detail(
      actor({ isSuperAdmin: true }),
      branchContext,
      'order-1',
    );

    expect(branchAdmin.allowedActions).toEqual({
      confirm: false,
      startPacking: false,
      startShipping: true,
      complete: false,
      cancel: true,
      updateInternalNote: true,
    });
    expect(Object.values(superAdmin.allowedActions)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('stores an internal note with its updater audit fields', async () => {
    const { service, tx } = createHarness();

    await service.updateInternalNote(actor(), branchContext, 'order-1', {
      note: 'Đang đóng gói tại kho chi nhánh.',
    });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        internalNote: 'Đang đóng gói tại kho chi nhánh.',
        internalNoteUpdatedById: 'admin-1',
        internalNoteUpdatedAt: expect.any(Date),
      },
    });
  });

  it('cancels a packing COD order and restores its stock once', async () => {
    const { service, tx } = createHarness();

    await service.cancel(actor(), branchContext, 'order-1', {
      reason: 'Sản phẩm bị lỗi tại kho',
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: OrderStatus.PACKING },
      data: expect.objectContaining({
        status: OrderStatus.CANCELLED,
        cancelReason: 'Sản phẩm bị lỗi tại kho',
      }),
    });
    expect(tx.branchProductStock.update).toHaveBeenCalledTimes(1);
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: OrderStatus.PACKING,
        toStatus: OrderStatus.CANCELLED,
        reason: 'Sản phẩm bị lỗi tại kho',
      }),
    });
  });
});
