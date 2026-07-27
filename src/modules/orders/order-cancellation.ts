import { ConflictException } from '@nestjs/common';
import {
  InventoryMovementSourceType,
  InventoryMovementType,
  OrderStatus,
  OrderStatusActorType,
  PaymentMethod,
  PaymentStatus,
  type Prisma,
} from '@/generated/prisma/client';
import { recordInventoryMovement } from '@/modules/inventory/inventory-movement';
import { recordOrderStatusHistory } from './order-status-history';

export const cancellableOrderInclude = {
  items: true,
  payment: {
    include: { transactions: { orderBy: { createdAt: 'desc' as const } } },
  },
} as const satisfies Prisma.OrderInclude;

export type CancellableOrder = Prisma.OrderGetPayload<{
  include: typeof cancellableOrderInclude;
}>;

export interface CancelOrderInput {
  allowedStatuses: ReadonlySet<OrderStatus>;
  actorType: OrderStatusActorType;
  actorUserId: string;
  actorDisplayName: string;
  actorRoleSnapshot?: string | null;
  reason: string;
  invalidStatusCode: string;
}

async function restoreStock(
  tx: Prisma.TransactionClient,
  order: CancellableOrder,
  sourceId: string,
  actorId: string,
  reason: string,
): Promise<void> {
  for (const item of order.items) {
    if (!item.variantId) continue;
    const stock = await tx.branchProductStock.update({
      where: {
        branchId_variantId: {
          branchId: order.branchId,
          variantId: item.variantId,
        },
      },
      data: { quantity: { increment: item.quantity } },
      select: { quantity: true },
    });
    await recordInventoryMovement(tx, {
      branchId: order.branchId,
      variantId: item.variantId,
      type: InventoryMovementType.ORDER_STOCK_RESTORED,
      quantityChange: item.quantity,
      beforeQuantity: stock.quantity - item.quantity,
      afterQuantity: stock.quantity,
      reason,
      sourceType: InventoryMovementSourceType.ORDER,
      sourceId,
      sourceCode: order.orderCode,
      actorId,
    });
  }
}

export async function cancelOrderInTransaction(
  tx: Prisma.TransactionClient,
  order: CancellableOrder,
  input: CancelOrderInput,
): Promise<boolean> {
  if (order.status === OrderStatus.CANCELLED) return false;
  if (!input.allowedStatuses.has(order.status)) {
    throw new ConflictException({
      code: input.invalidStatusCode,
      message: 'Đơn hàng đã được xử lý và không thể hủy.',
    });
  }
  if (
    order.payment?.method === PaymentMethod.VNPAY &&
    order.payment.status === PaymentStatus.PAID
  ) {
    throw new ConflictException({
      code: 'ORDER_CANCELLATION_REQUIRES_REFUND',
      message: 'Đơn đã thanh toán cần được xử lý hoàn tiền trước khi hủy.',
    });
  }

  const now = new Date();
  const claimed = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data: {
      status: OrderStatus.CANCELLED,
      cancelledAt: now,
      cancelReason: input.reason,
    },
  });
  if (claimed.count !== 1) {
    throw new ConflictException({
      code: 'ORDER_CONCURRENT_UPDATE',
      message: 'Đơn hàng đã được xử lý bởi người khác. Vui lòng tải lại.',
    });
  }

  let restoredStock = false;
  const activeHold = order.payment?.transactions.find(
    (transaction) =>
      transaction.stockReservedAt !== null &&
      transaction.stockReleasedAt === null &&
      transaction.stockConsumedAt === null,
  );
  if (activeHold) {
    const holdClaimed = await tx.paymentTransaction.updateMany({
      where: {
        id: activeHold.id,
        stockReservedAt: { not: null },
        stockReleasedAt: null,
        stockConsumedAt: null,
      },
      data: { stockReleasedAt: now },
    });
    if (holdClaimed.count === 1) {
      await restoreStock(
        tx,
        order,
        activeHold.id,
        input.actorUserId,
        input.reason,
      );
      restoredStock = true;
    }
  } else if (
    order.payment?.method === PaymentMethod.COD &&
    order.stockDeductedAt &&
    !order.stockRestoredAt
  ) {
    await restoreStock(tx, order, order.id, input.actorUserId, input.reason);
    restoredStock = true;
  }

  if (restoredStock) {
    await tx.order.update({
      where: { id: order.id },
      data: { stockRestoredAt: now },
    });
  }
  if (
    order.payment &&
    (order.payment.status === PaymentStatus.PENDING ||
      order.payment.status === PaymentStatus.UNPAID)
  ) {
    await tx.payment.update({
      where: { id: order.payment.id },
      data: { status: PaymentStatus.CANCELLED },
    });
  }
  await recordOrderStatusHistory(tx, {
    orderId: order.id,
    fromStatus: order.status,
    toStatus: OrderStatus.CANCELLED,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    actorDisplayNameSnapshot: input.actorDisplayName,
    actorRoleSnapshot: input.actorRoleSnapshot,
    branchId: order.branchId,
    reason: input.reason,
    createdAt: now,
  });
  return true;
}
