import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '@/database/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher';
import { NotificationWorker } from '@/modules/notifications/notification-worker.service';

interface Trace {
  id: string;
  orderId: string;
  direction: 'admin-customer' | 'customer-admin';
  action: string;
  targetStatus?: string;
  requestAt: number;
  transactionAt?: number;
  commitAt?: number;
  responseAt?: number;
  httpStatus?: number;
  notificationCommitAt?: number;
  notificationEmitAt?: number;
  notificationId?: string;
  workerClaimAt?: number;
  orderEmitAt?: number;
}
interface Observation {
  kind: string;
  at: number;
  session: string;
  [key: string]: unknown;
}
interface Context {
  trace?: Trace;
  request?: Request;
}
const epoch = () => performance.timeOrigin + performance.now();
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');

/** Test-only instrumentation. Never imported by AppModule or production bootstrap. */
export function installOrderRealtimeProbe(
  app: INestApplication,
  phase: string,
  directory: string,
) {
  const context = new AsyncLocalStorage<Context>();
  const traces: Trace[] = [],
    observations: Observation[] = [];
  const claims = new Map<string, number>();
  const prisma = app.get(PrismaService),
    publisher = app.get(RealtimePublisher);
  mkdirSync(directory, { recursive: true });
  const save = () =>
    writeFileSync(
      `${directory}/${phase}.json`,
      JSON.stringify({ phase, traces, observations }, null, 2),
    );
  const expected = (trace: Trace) =>
    trace.action === 'confirm-received'
      ? 'ORDER_RECEIVED'
      : trace.action === 'cancel'
        ? trace.direction === 'admin-customer'
          ? 'ORDER_ADMIN_CANCELLED'
          : 'ORDER_CUSTOMER_CANCELLED'
        : `ORDER_${trace.targetStatus ?? ''}`;

  const transaction = prisma.$transaction.bind(prisma) as (
    ...args: unknown[]
  ) => Promise<unknown>;
  prisma.$transaction = (async (...args: unknown[]) => {
    const current = context.getStore();
    if (current?.trace && typeof args[0] === 'function') {
      current.trace.transactionAt ??= epoch();
      const body: unknown = current.request?.body;
      if (record(body) && typeof body.targetStatus === 'string')
        current.trace.targetStatus = body.targetStatus;
    }
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
                const sql = Array.isArray(query[0])
                  ? query[0].join(' ').replace(/\s+/g, ' ')
                  : '';
                if (
                  sql.includes('SELECT id FROM notification_dispatches') &&
                  Array.isArray(result)
                )
                  for (const row of result)
                    if (record(row) && typeof row.id === 'string')
                      claims.set(row.id, epoch());
                return result;
              };
            },
          }),
        );
    }
    const result: unknown = await transaction(...args);
    const committedAt = epoch();
    if (current?.trace && typeof args[0] === 'function')
      current.trace.commitAt ??= committedAt;
    if (Array.isArray(result))
      for (const row of result) {
        if (
          !record(row) ||
          typeof row.dispatchId !== 'string' ||
          typeof row.referenceId !== 'string' ||
          typeof row.type !== 'string'
        )
          continue;
        const trace = traces.findLast(
          (item) =>
            item.orderId === row.referenceId && expected(item) === row.type,
        );
        if (trace) {
          trace.notificationCommitAt ??= committedAt;
          trace.notificationId = String(row.id);
          trace.workerClaimAt ??= claims.get(row.dispatchId);
        }
      }
    return result;
  }) as typeof prisma.$transaction;

  const publish = publisher.publishToUser.bind(publisher);
  publisher.publishToUser = (userId, event, entitled) => {
    const at = epoch(),
      data = event.data as Record<string, unknown>;
    if (event.name === 'notification.changed' && typeof data.id === 'string') {
      const trace = traces.findLast((item) => item.notificationId === data.id);
      if (trace) trace.notificationEmitAt ??= at;
    }
    if (event.name === 'order.changed' && typeof data.orderId === 'string') {
      const trace = traces.findLast((item) => item.orderId === data.orderId);
      if (trace) trace.orderEmitAt ??= at;
    }
    return publish(userId, event, entitled);
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/_test/realtime/clock' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ epochMs: epoch() });
      return;
    }
    if (req.path === '/_test/realtime/results' && req.method === 'GET') {
      save();
      res.json({ phase, traces, observations });
      return;
    }
    if (req.path === '/_test/realtime/observation' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        if (chunks.reduce((sum, item) => sum + item.length, 0) < 100000)
          chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          const value: unknown = JSON.parse(Buffer.concat(chunks).toString());
          if (
            record(value) &&
            typeof value.kind === 'string' &&
            typeof value.at === 'number' &&
            typeof value.session === 'string' &&
            observations.length < 30000
          )
            observations.push(value as Observation);
          save();
          res.json({ ok: true });
        } catch {
          res.status(400).json({ ok: false });
        }
      });
      return;
    }
    const match = req.path.match(
      /\/(admin|customer)\/orders\/([0-7][0-9A-HJKMNP-TV-Z]{25})\/(transitions|cancel|confirm-received)$/,
    );
    if (req.method !== 'POST' || !match) {
      next();
      return;
    }
    const supplied = req.headers['x-bookora-probe-id'];
    const trace: Trace = {
      id:
        typeof supplied === 'string'
          ? supplied.slice(0, 80)
          : `server-${traces.length + 1}`,
      orderId: match[2],
      direction: match[1] === 'admin' ? 'admin-customer' : 'customer-admin',
      action: match[3],
      requestAt: epoch(),
    };
    traces.push(trace);
    res.once('finish', () => {
      trace.responseAt = epoch();
      trace.httpStatus = res.statusCode;
      save();
    });
    context.run({ trace, request: req }, next);
  });
  return { save, traces, observations, worker: app.get(NotificationWorker) };
}
