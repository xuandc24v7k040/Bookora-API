import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { creditMembershipOrder } from './membership-credit';
import { qualifiedMerchandise } from './membership-rules';

export interface BackfillOptions {
  apply?: boolean;
  batchSize?: number;
  maxBatches?: number;
  onProgress?: (value: unknown) => void;
}

/** Re-scan on restart: unique order ledger makes every committed batch replay-safe. */
export async function backfillMembership(
  prisma: PrismaClient,
  options: BackfillOptions = {},
) {
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
    throw new Error('batchSize must be 1–500');
  const report = {
    customerCount: await prisma.user.count({ where: { type: 'CUSTOMER' } }),
    eligible: 0,
    alreadyCredited: 0,
    newlyCredited: 0,
    zeroAmount: 0,
    invalid: 0,
    eligibleVnd: '0',
    newlyCreditedVnd: '0',
    enrolled: 0,
    interrupted: false,
    reconciliationErrors: 0,
  };
  let cursor: { sortAt: Date; id: string } | undefined;
  let total = new Prisma.Decimal(0),
    credited = new Prisma.Decimal(0);
  for (let batch = 0; ; batch++) {
    if (options.maxBatches !== undefined && batch >= options.maxBatches) {
      report.interrupted = true;
      break;
    }
    // Real effective business chronology; placedAt only orders unknown dates, never becomes achievedAt.
    const ids = await prisma.$queryRaw<
      Array<{ id: string; sortAt: Date }>
    >(Prisma.sql`
      SELECT o.id, COALESCE(CASE WHEN p.paid_at IS NOT NULL AND h.completed_at IS NOT NULL
        THEN GREATEST(p.paid_at, h.completed_at) END, o.placed_at) AS "sortAt"
      FROM orders o JOIN payments p ON p.order_id=o.id JOIN users u ON u.id=o.user_id
      LEFT JOIN LATERAL (SELECT min(created_at) AS completed_at FROM order_status_histories
        WHERE order_id=o.id AND to_status='COMPLETED' AND event_type='STATUS_CHANGED') h ON true
      WHERE o.status='COMPLETED' AND p.status='PAID' AND u.type='CUSTOMER'
        ${cursor ? Prisma.sql`AND (COALESCE(CASE WHEN p.paid_at IS NOT NULL AND h.completed_at IS NOT NULL THEN GREATEST(p.paid_at,h.completed_at) END,o.placed_at), o.id) > (${cursor.sortAt},${cursor.id})` : Prisma.empty}
      ORDER BY "sortAt", o.id LIMIT ${batchSize}`);
    if (!ids.length) break;
    const rows = await prisma.order.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      include: { items: true, membershipTransaction: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of ids) {
      const order = byId.get(id.id)!;
      report.eligible++;
      let amount: Prisma.Decimal;
      try {
        amount = qualifiedMerchandise(order);
      } catch {
        report.invalid++;
        options.onProgress?.({
          orderId: order.id,
          reason: 'INVALID_MONEY_SNAPSHOT',
        });
        continue;
      }
      total = total.add(amount);
      if (amount.isZero()) {
        report.zeroAmount++;
        continue;
      }
      if (order.membershipTransaction) {
        report.alreadyCredited++;
        if (!order.membershipTransaction.amount.eq(amount))
          report.reconciliationErrors++;
        continue;
      }
      if (!options.apply) continue;
      const result = await runSerializableTransaction(prisma, (tx) =>
        creditMembershipOrder(tx, order.id, 'BACKFILL'),
      );
      if (result === 'CREDITED') {
        report.newlyCredited++;
        credited = credited.add(amount);
      } else if (result === 'ALREADY_CREDITED') report.alreadyCredited++;
    }
    cursor = { sortAt: ids.at(-1)!.sortAt, id: ids.at(-1)!.id };
    report.eligibleVnd = total.toString();
    report.newlyCreditedVnd = credited.toString();
    options.onProgress?.({ ...report, cursor });
    if (ids.length < batchSize) break;
  }
  if (options.apply) {
    let userCursor: string | undefined;
    for (;;) {
      const users = await prisma.user.findMany({
        where: {
          type: 'CUSTOMER',
          id: userCursor ? { gt: userCursor } : undefined,
          membership: null,
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: batchSize,
      });
      if (!users.length) break;
      const enrolled = await prisma.customerMembership.createMany({
        data: users.map((user) => ({ userId: user.id })),
        skipDuplicates: true,
      });
      report.enrolled += enrolled.count;
      userCursor = users.at(-1)!.id;
    }
  }
  const [mismatches] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) FROM customer_memberships m WHERE m.lifetime_spend <>
      COALESCE((SELECT sum(amount) FROM membership_transactions t WHERE t.user_id=m.user_id),0)`;
  report.reconciliationErrors += Number(mismatches.count);
  return report;
}
