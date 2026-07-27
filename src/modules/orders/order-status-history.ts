import type {
  OrderStatus,
  OrderStatusActorType,
  Prisma,
} from '@/generated/prisma/client';

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

export function recordOrderStatusHistory(
  tx: Prisma.TransactionClient,
  input: RecordOrderStatusHistoryInput,
) {
  return tx.orderStatusHistory.create({
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
}
