import type { Prisma } from '@/generated/prisma/client';

export type OrderNotificationKind =
  | 'ORDER_NEW_COD'
  | 'ORDER_NEW_PAID'
  | 'PAYMENT_PAID'
  | 'ORDER_CONFIRMED'
  | 'ORDER_PACKING'
  | 'ORDER_SHIPPING'
  | 'ORDER_COMPLETED'
  | 'ORDER_ADMIN_CANCELLED'
  | 'ORDER_CUSTOMER_CANCELLED'
  | 'ORDER_RECEIVED'
  | 'PAYMENT_TERMINAL';

/** Called inside the domain transaction. Never performs network I/O. */
export async function enqueueOrderNotification(
  tx: Prisma.TransactionClient,
  input: {
    eventKey: string;
    kind: OrderNotificationKind;
    orderId: string;
    branchId: string;
    actorUserId?: string | null;
    dueAt?: Date;
  },
): Promise<void> {
  await tx.notificationDispatch.createMany({
    data: [
      {
        eventKey: input.eventKey,
        kind: input.kind,
        referenceId: input.orderId,
        branchId: input.branchId,
        actorUserId: input.actorUserId,
        dueAt: input.dueAt ?? new Date(),
      },
    ],
    skipDuplicates: true,
  });
}

export async function schedulePromotion(
  tx: Prisma.TransactionClient,
  kind: 'COUPON_ACTIVE' | 'FLASH_SALE_ACTIVE',
  id: string,
  startAt: Date,
  isNew = false,
): Promise<void> {
  const eventKey = `${kind}:${id}`;
  const old = await tx.notificationDispatch.findUnique({ where: { eventKey } });
  // Existing active campaigns are deliberately not backfilled at rollout.
  if (!old && !isNew && startAt <= new Date()) return;
  if (old?.audienceCutoff || old?.state === 'DONE') return;
  await tx.notificationDispatch.upsert({
    where: { eventKey },
    create: { kind, referenceId: id, eventKey, dueAt: startAt },
    update: { dueAt: startAt, state: 'PENDING', skipReason: null },
  });
}
