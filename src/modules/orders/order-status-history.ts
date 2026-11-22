import type {
  OrderStatus,
  OrderStatusActorType,
  Prisma,
} from '@/generated/prisma/client';
import {
  enqueueOrderNotification,
  type OrderNotificationKind,
} from '@/modules/notifications/notification-intents';
import { signalOrderChange } from './order-change-signal';
import { creditMembershipOrder } from '@/modules/membership/membership-credit';

export interface RecordOrderStatusHistoryInput {
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorType: OrderStatusActorType;
  actorUserId?: string | null;
  actorDisplayNameSnapshot?: string | null;
  actorRoleSnapshot?: string | null;
  branchId: string;
  reason?: string | null;
  note?: string | null;
  createdAt?: Date;
}

export async function recordOrderStatusHistory(
  tx: Prisma.TransactionClient,
  input: RecordOrderStatusHistoryInput,
) {
  const history = await tx.orderStatusHistory.create({
    data: {
      orderId: input.orderId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      actorDisplayNameSnapshot: input.actorDisplayNameSnapshot ?? null,
      actorRoleSnapshot: input.actorRoleSnapshot ?? null,
      branchId: input.branchId,
      reason: input.reason ?? null,
      note: input.note ?? null,
      createdAt: input.createdAt,
    },
  });
  let kind: OrderNotificationKind | undefined;
  if (input.fromStatus !== input.toStatus) {
    if (input.actorType === 'ADMIN') {
      const kinds: Partial<Record<OrderStatus, OrderNotificationKind>> = {
        CONFIRMED: 'ORDER_CONFIRMED',
        PACKING: 'ORDER_PACKING',
        SHIPPING: 'ORDER_SHIPPING',
        COMPLETED: 'ORDER_COMPLETED',
        CANCELLED: 'ORDER_ADMIN_CANCELLED',
      };
      kind = kinds[input.toStatus];
    } else if (input.actorType === 'CUSTOMER' && input.toStatus === 'CANCELLED')
      kind = 'ORDER_CUSTOMER_CANCELLED';
    else if (
      input.actorType === 'SYSTEM' &&
      input.fromStatus === 'PENDING_PAYMENT' &&
      input.toStatus === 'PENDING'
    ) {
      kind = 'ORDER_NEW_PAID';
      await enqueueOrderNotification(tx, {
        eventKey: `${history.id}:PAYMENT_PAID`,
        kind: 'PAYMENT_PAID',
        orderId: input.orderId,
        branchId: input.branchId,
      });
    } else if (
      input.actorType === 'SYSTEM' &&
      input.toStatus === 'CANCELLED' &&
      (input.fromStatus === 'PENDING_PAYMENT' ||
        input.fromStatus === 'PAYMENT_FAILED')
    )
      kind = 'PAYMENT_TERMINAL';
  }
  if (kind)
    await enqueueOrderNotification(tx, {
      eventKey: `${history.id}:${kind}`,
      kind,
      orderId: input.orderId,
      branchId: input.branchId,
      actorUserId: input.actorUserId,
    });
  if (input.fromStatus !== input.toStatus && input.toStatus === 'COMPLETED')
    await creditMembershipOrder(tx, input.orderId);
  if (input.fromStatus !== input.toStatus)
    await signalOrderChange(tx, input.orderId);
  return history;
}
