import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { ulid } from 'ulid';
import { ConfigService } from '@nestjs/config';
import { createNotificationEnvironment } from './helpers/notification-environment';
import { installOrderRealtimeProbe } from './helpers/order-realtime-probe';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { FlashSalesService } from '@/modules/flash-sales/flash-sales.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher';
import { notificationRuntimeActions } from './helpers/notification-runtime-actions';
import { backfillMembership } from '@/modules/membership/membership-backfill';
import { MembershipQueryService } from '@/modules/membership/membership-query.service';
import {
  installPromotionTimingProbe,
  monotonicEpoch,
} from './helpers/promotion-timing-probe';

/** Isolated, migrated local DB; stdin only. Never imported by the application. */
async function main() {
  const directory =
    process.env.LATENCY_EVIDENCE_DIR ??
    'C:/Users/Admin/AppData/Local/Temp/bookora-promotion-sync';
  const phase = process.env.LATENCY_PHASE ?? 'before';
  mkdirSync(directory, { recursive: true });
  const events: object[] = [];
  const campaigns: object[] = [];
  const batches: object[] = [];
  const save = () =>
    writeFileSync(
      `${directory}/${phase}-promotions.json`,
      JSON.stringify({ campaigns, events, batches }, null, 2),
    );
  const env = await createNotificationEnvironment(18000, true, (app) => {
    app.get(ConfigService).set('NOTIFICATIONS_POLL_MS', 5000);
    installOrderRealtimeProbe(app, phase, directory);
    installPromotionTimingProbe(app, batches);
    const publisher = app.get(RealtimePublisher);
    const original = publisher.publishToUser.bind(publisher);
    publisher.publishToUser = (userId, event, entitled) => {
      if (event.name === 'notification.changed') {
        events.push({ at: monotonicEpoch(), customer: userId, ...event });
        save();
      }
      return original(userId, event, entitled);
    };
  });
  const actions = notificationRuntimeActions(env);
  const coupons = env.app.get(CouponsService),
    sales = env.app.get(FlashSalesService);
  console.log(
    JSON.stringify({
      ready: true,
      phase,
      database: env.infra.database.databaseName,
      api: env.url,
    }),
  );
  const input = createInterface({ input: process.stdin });
  let queue = Promise.resolve();
  input.on('line', (line) => {
    queue = queue
      .then(async () => {
        if (await actions(line)) return;
        const [action, value] = line.split(' ');
        if (action === 'audience') {
          const size = Number(value);
          if (!Number.isInteger(size) || size < 1 || size > 1000)
            throw new Error('Fixture audience must be between 1 and 1000');
          await env.prisma.user.createMany({
            data: Array.from({ length: size }, () => ({
              email: `acceptance-${ulid()}@example.test`,
              fullName: 'Acceptance fixture',
              type: 'CUSTOMER' as const,
            })),
          });
          console.log(JSON.stringify({ audienceAdded: size }));
        }
        if (action === 'backfill') {
          const order = await env.place();
          // A historical qualified snapshot, deliberately not a live completion hook.
          await env.prisma.order.update({
            where: { id: order.orderId },
            data: {
              status: 'COMPLETED',
              subtotalAmount: 2500000,
              orderCouponDiscountAmount: 0,
              items: {
                updateMany: {
                  where: {},
                  data: { lineTotal: 2500000, couponDiscountAmount: 0 },
                },
              },
              payment: { update: { status: 'PAID', paidAt: new Date() } },
              statusHistories: {
                create: {
                  fromStatus: 'SHIPPING',
                  toStatus: 'COMPLETED',
                  actorType: 'ADMIN',
                  branchId: env.branches[0].id,
                },
              },
            },
          });
          const before = await env.prisma.notification.count({
            where: { type: 'MEMBERSHIP_UPGRADED' },
          });
          const result = await backfillMembership(env.prisma, {
            apply: true,
            batchSize: 10,
          });
          console.log(
            JSON.stringify({
              backfill: result,
              membership: await env.app
                .get(MembershipQueryService)
                .summary(env.customerA.user.id),
              membershipNotificationsBefore: before,
              membershipNotificationsAfter: await env.prisma.notification.count(
                { where: { type: 'MEMBERSHIP_UPGRADED' } },
              ),
            }),
          );
        }
        if (action === 'http-stop') {
          const server = env.app.getHttpServer() as Server;
          server.close();
          server.closeAllConnections();
          console.log(
            JSON.stringify({ httpListening: server.listening, at: Date.now() }),
          );
        }
        if (action === 'http-start') {
          const server = env.app.getHttpServer() as Server;
          await new Promise<void>((resolve) =>
            server.listen(18000, '127.0.0.1', resolve),
          );
          console.log(JSON.stringify({ httpListening: true, at: Date.now() }));
        }
        if (action === 'checkout-fixture') {
          await env.prisma.productVariant.update({
            where: { id: env.variant.id },
            data: { originalPrice: 100000 },
          });
          const startAt = new Date(Date.now() - 1000).toISOString(),
            endAt = new Date(Date.now() + 3600000).toISOString();
          for (const type of ['ORDER', 'SHIPPING'] as const)
            await coupons.save({
              code: `ACCEPT${type}`,
              name: `Acceptance ${type}`,
              type,
              visibility: 'PUBLIC',
              discountType: 'FIXED_AMOUNT',
              discountValue: type === 'ORDER' ? 10000 : 5000,
              startAt,
              endAt,
              isActive: true,
            });
          const sale = await sales.save(
            {
              name: 'Acceptance checkout Flash',
              startAt,
              endAt,
              items: [
                {
                  variantId: env.variant.id,
                  flashPrice: 80000,
                  totalQuota: 50,
                  maxQuantityPerUser: 3,
                },
              ],
            },
            env.system.user.id,
          );
          await sales.control(
            sale.id,
            { action: 'publish' },
            env.system.user.id,
          );
          const cart = await env.prisma.cart.upsert({
            where: { userId: env.customerA.user.id },
            create: {
              userId: env.customerA.user.id,
              branchId: env.branches[0].id,
            },
            update: { branchId: env.branches[0].id },
          });
          await env.prisma.cartItem.upsert({
            where: {
              cartId_variantId: { cartId: cart.id, variantId: env.variant.id },
            },
            create: {
              cartId: cart.id,
              variantId: env.variant.id,
              quantity: 1,
              lastKnownUnitPrice: 100000,
            },
            update: { quantity: 1 },
          });
          console.log('CHECKOUT_FIXTURE_READY');
        }
        if (action === 'replay-membership') {
          // Replay the SAME persisted live event to model duplicate delivery.
          const row = await env.prisma.notification.findFirstOrThrow({
            where: {
              userId: env.customerA.user.id,
              type: 'MEMBERSHIP_UPGRADED',
            },
            orderBy: { createdAt: 'desc' },
          });
          await env.app.get(RealtimePublisher).publishToUser(
            row.userId,
            {
              name: 'notification.changed',
              version: 1,
              data: { id: row.id, branchId: row.branchId, type: row.type },
            },
            (principal) =>
              principal.id === row.userId && principal.type === 'CUSTOMER',
          );
          console.log('REPLAYED_EXISTING_MEMBERSHIP_HINT');
        }
        if (action === 'price')
          await env.prisma.productVariant.update({
            where: { id: env.variant.id },
            data: { originalPrice: Number(value) },
          });
        if (action === 'schedule') {
          const now = Date.now(),
            delay = Number(value ?? 65000);
          const startAt = new Date(now + delay).toISOString(),
            endAt = new Date(now + delay + 45000).toISOString();
          const coupon = await coupons.save({
            code: `SYNC${now}`,
            name: `Coupon sync ${now}`,
            type: 'ORDER',
            visibility: 'PUBLIC',
            discountType: 'PERCENTAGE',
            discountValue: 5,
            startAt,
            endAt,
            isActive: true,
          });
          // Different variant per campaign avoids overlapping published-offer validation.
          const variant = await env.prisma.productVariant.create({
            data: {
              productId: env.variant.productId,
              sku: `SYNC${now}`,
              name: `Bản sync ${now}`,
              combinationKey: `sync-${now}`,
              originalPrice: 100000,
              weightGram: 350,
            },
          });
          await env.prisma.branchProductStock.create({
            data: {
              branchId: env.branches[0].id,
              variantId: variant.id,
              quantity: 1000,
            },
          });
          const sale = await sales.save(
            {
              name: `Flash sync ${now}`,
              startAt,
              endAt,
              items: [
                {
                  variantId: variant.id,
                  flashPrice: 80000,
                  totalQuota: 50,
                  maxQuantityPerUser: 3,
                },
              ],
            },
            env.system.user.id,
          );
          await sales.control(
            sale.id,
            { action: 'publish' },
            env.system.user.id,
          );
          campaigns.push({
            couponId: coupon.id,
            saleId: sale.id,
            committedAt: Date.now(),
            startAt,
            endAt,
          });
          save();
          console.log(JSON.stringify({ scheduled: true, startAt, endAt }));
        }
        if (action === 'metrics') {
          const clockStart = monotonicEpoch();
          const [clock] = await env.prisma.$queryRaw<
            Array<{ now: Date }>
          >`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`;
          console.log(
            JSON.stringify({
              clock: {
                start: clockStart,
                database: clock.now.getTime(),
                end: monotonicEpoch(),
              },
            }),
          );
          const plans = await env.prisma
            .$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT MIN(start_at) FROM coupons WHERE is_active AND start_at > (clock_timestamp() AT TIME ZONE 'UTC')`;
          writeFileSync(
            `${directory}/${phase}-boundary-plan.json`,
            JSON.stringify(plans, null, 2),
          );
          const rows = await env.prisma.notification.findMany({
            select: {
              id: true,
              referenceId: true,
              type: true,
              createdAt: true,
              userId: true,
            },
          });
          writeFileSync(
            `${directory}/${phase}-notifications.json`,
            JSON.stringify(rows, null, 2),
          );
          save();
          console.log(
            JSON.stringify({
              counts: await env.prisma.notification.groupBy({
                by: ['type'],
                _count: true,
              }),
              jobs: await env.prisma.notificationDispatch.groupBy({
                by: ['state'],
                _count: true,
              }),
              orders: await env.prisma.order.findMany({
                where: { userId: env.customerA.user.id },
                select: {
                  id: true,
                  orderCode: true,
                  status: true,
                  totalAmount: true,
                  payment: { select: { method: true, status: true } },
                },
                orderBy: { createdAt: 'desc' },
              }),
            }),
          );
        }
        if (action === 'worker-stop') await env.worker.onModuleDestroy();
        if (action === 'worker-start') env.worker.onModuleInit();
        if (action === 'stop') {
          save();
          await env.app.close();
          console.log('STOPPED_DATABASE_RETAINED');
          process.exit(0);
        }
      })
      .catch((error: unknown) =>
        console.error(
          error instanceof Error
            ? error.message
            : 'PROMOTION_RUNTIME_ACTION_FAILED',
        ),
      );
  });
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Runtime failed');
  process.exitCode = 1;
});
