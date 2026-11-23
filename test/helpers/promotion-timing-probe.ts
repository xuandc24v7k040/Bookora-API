import { performance } from 'node:perf_hooks';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');
export const monotonicEpoch = () => performance.timeOrigin + performance.now();

/** Passive, fixture-only transaction instrumentation; never imported by AppModule. */
export function installPromotionTimingProbe(
  app: INestApplication,
  batches: object[],
) {
  const prisma = app.get(PrismaService);
  const original = prisma.$transaction.bind(prisma) as (
    ...args: unknown[]
  ) => Promise<unknown>;
  prisma.$transaction = (async (...args: unknown[]) => {
    let claimedAt: number | undefined;
    if (typeof args[0] === 'function') {
      const callback = args[0] as (tx: object) => Promise<unknown>;
      args[0] = (tx: object) =>
        callback(
          new Proxy(tx, {
            get(target, key) {
              const method: unknown = Reflect.get(target, key);
              if (key !== '$queryRaw' || typeof method !== 'function')
                return method;
              return async (...query: unknown[]) => {
                const result: unknown = await Reflect.apply(
                  method,
                  target,
                  query,
                );
                const sql = Array.isArray(query[0]) ? query[0].join(' ') : '';
                if (
                  sql.includes('SELECT id FROM notification_dispatches') &&
                  Array.isArray(result) &&
                  result.length
                )
                  claimedAt = monotonicEpoch();
                return result;
              };
            },
          }),
        );
    }
    const result = await original(...args);
    const committedAt = monotonicEpoch();
    if (Array.isArray(result))
      for (const row of result) {
        if (
          record(row) &&
          typeof row.dispatchId === 'string' &&
          typeof row.referenceId === 'string'
        )
          batches.push({
            notificationId: row.id,
            referenceId: row.referenceId,
            type: row.type,
            userId: row.userId,
            claimedAt,
            committedAt,
          });
      }
    return result;
  }) as typeof prisma.$transaction;
}
