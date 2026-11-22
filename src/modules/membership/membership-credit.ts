import { Prisma, type MembershipSource } from '@/generated/prisma/client';
import {
  eligibleTier,
  higherTier,
  qualifiedMerchandise,
} from './membership-rules';
import { ConflictException } from '@nestjs/common';

/** Participates in the caller's transaction. No HTTP/socket side effects before commit. */
export async function creditMembershipOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
  source: Extract<MembershipSource, 'ORDER' | 'BACKFILL'> = 'ORDER',
): Promise<'CREDITED' | 'ALREADY_CREDITED' | 'INELIGIBLE' | 'ZERO_AMOUNT'> {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { type: true } },
      payment: true,
      items: true,
      statusHistories: {
        where: { toStatus: 'COMPLETED', eventType: 'STATUS_CHANGED' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 1,
      },
    },
  });
  if (
    !order ||
    order.user.type !== 'CUSTOMER' ||
    order.status !== 'COMPLETED' ||
    order.payment?.status !== 'PAID'
  )
    return 'INELIGIBLE';
  if (await tx.membershipTransaction.findUnique({ where: { orderId } }))
    return 'ALREADY_CREDITED';
  let amount: Prisma.Decimal;
  try {
    amount = qualifiedMerchandise(order);
  } catch {
    throw new ConflictException({
      code: 'MEMBERSHIP_INVALID_SNAPSHOT',
      message:
        'Snapshot tiền hàng không khớp. Vui lòng kiểm tra đơn trước khi hoàn tất.',
    });
  }
  if (amount.isZero()) return 'ZERO_AMOUNT';
  // All credits use one committed config. Saves/re-evaluation take the exclusive lock.
  await tx.$queryRaw`SELECT id FROM membership_config WHERE id = 'GLOBAL' FOR SHARE`;
  const config = await tx.membershipConfig.findUniqueOrThrow({
    where: { id: 'GLOBAL' },
  });
  await tx.customerMembership.createMany({
    data: [{ userId: order.userId }],
    skipDuplicates: true,
  });
  await tx.$queryRaw`SELECT user_id FROM customer_memberships WHERE user_id = ${order.userId} FOR UPDATE`;
  const membership = await tx.customerMembership.findUniqueOrThrow({
    where: { userId: order.userId },
  });
  const spend = membership.lifetimeSpend.add(amount);
  const tier = higherTier(membership.currentTier, eligibleTier(spend, config));
  const completedAt = order.statusHistories[0]?.createdAt;
  const paidAt = order.payment.paidAt;
  // Unknown historical chronology stays null instead of fabricating an achievement date.
  const effectiveAt =
    completedAt && paidAt
      ? new Date(Math.max(completedAt.getTime(), paidAt.getTime()))
      : null;
  const incompleteChronology =
    source === 'BACKFILL' &&
    (await tx.order.count({
      where: {
        userId: order.userId,
        status: 'COMPLETED',
        payment: { status: 'PAID' },
        OR: [
          { payment: { paidAt: null } },
          {
            statusHistories: {
              none: { toStatus: 'COMPLETED', eventType: 'STATUS_CHANGED' },
            },
          },
        ],
      },
    })) > 0;
  const achievedAt = incompleteChronology ? null : effectiveAt;
  await tx.membershipTransaction.create({
    data: { orderId, userId: order.userId, amount, source, effectiveAt },
  });
  await tx.customerMembership.update({
    where: { userId: order.userId },
    data: {
      lifetimeSpend: spend,
      currentTier: tier,
      ...(tier !== membership.currentTier ? { achievedAt } : {}),
    },
  });
  if (tier !== membership.currentTier) {
    const history = await tx.membershipTierHistory.create({
      data: {
        userId: order.userId,
        fromTier: membership.currentTier,
        toTier: tier,
        source,
        orderId,
        configVersion: config.version,
        effectiveAt: achievedAt,
      },
    });
    if (source === 'ORDER')
      await tx.notificationDispatch.create({
        data: {
          eventKey: `MEMBERSHIP_UPGRADED:${history.id}`,
          kind: 'MEMBERSHIP_UPGRADED',
          referenceId: orderId,
          dueAt: new Date(),
        },
      });
  }
  return 'CREDITED';
}
