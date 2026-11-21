import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { createNotificationEnvironment } from './helpers/notification-environment';
import { installOrderRealtimeProbe } from './helpers/order-realtime-probe';
import { notificationRuntimeActions } from './helpers/notification-runtime-actions';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { schedulePromotion } from '@/modules/notifications/notification-intents';

async function main() {
  const phase = process.env.LATENCY_PHASE ?? 'before';
  const directory =
    process.env.LATENCY_EVIDENCE_DIR ??
    'C:/Users/Admin/AppData/Local/Temp/bookora-latency-evidence';
  let probe!: ReturnType<typeof installOrderRealtimeProbe>;
  const env = await createNotificationEnvironment(18000, true, (app) => {
    app.get(ConfigService).set('NOTIFICATIONS_POLL_MS', 5000);
    probe = installOrderRealtimeProbe(app, phase, directory);
  });
  const orders: Array<{ id: string; code: string; purpose: string }> = [];
  for (let index = 0; index < 20; index++) {
    const result = await env.place();
    orders.push({
      id: result.orderId,
      code: result.orderCode,
      purpose: index < 10 ? 'confirm' : 'cancel',
    });
  }
  for (let index = 0; index < 21; index++) await env.worker.tick();
  const extraAction = notificationRuntimeActions(env);
  const fixture = {
    ready: true,
    phase,
    pollMs: 5000,
    database: env.infra.database.databaseName,
    orders,
    branch: env.branches[0].id,
    branches: env.branches.map(({ id, name }) => ({ id, name })),
    product: await env.prisma.product.findFirstOrThrow({
      where: { variants: { some: { id: env.variant.id } } },
      select: { id: true, slug: true },
    }),
    customer: 'customer-a@realtime.example.test',
    admin: 'branch-admin@realtime.example.test',
  };
  writeFileSync(
    `${directory}/${phase}-fixture.json`,
    JSON.stringify(fixture, null, 2),
  );
  console.log(JSON.stringify(fixture));
  const input = createInterface({ input: process.stdin });
  input.on('line', (line) => {
    void (async () => {
      if (await extraAction(line)) return;
      if (line === 'branch-b-cod') {
        const order = await env.place('COD', env.branches[1].id);
        console.log(`BRANCH_B_COD:${order.orderId}`);
      }
      if (line === 'prepare-cart') {
        const cart = await env.prisma.cart.findUniqueOrThrow({
          where: { userId: env.customerA.user.id },
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
        console.log('TEST_CART_READY');
      }
      if (line === 'revoke-customer') {
        const session = await env.prisma.authSession.findFirstOrThrow({
          where: { userId: env.customerA.user.id, revokedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        await env.prisma.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        console.log('LATEST_CUSTOMER_SESSION_REVOKED');
      }
      if (line === 'promotion-suite') {
        const now = Date.now(),
          references: Array<{ id: string; kind: string; startAt: string }> = [];
        for (const kind of [
          'future',
          'private',
          'disabled',
          'active',
        ] as const) {
          const startAt = new Date(
            now + (kind === 'future' ? 20000 : -1000),
          ).toISOString();
          const coupon = await env.app.get(CouponsService).save({
            code: `LAT${now}${kind.toUpperCase()}`,
            name: `Ưu đãi kiểm thử ${kind}`,
            type: 'ORDER',
            visibility: kind === 'private' ? 'PRIVATE' : 'PUBLIC',
            discountType: 'PERCENTAGE',
            discountValue: 5,
            startAt,
            endAt: new Date(now + 600000).toISOString(),
            isActive: kind !== 'disabled',
          });
          references.push({ id: coupon.id, kind, startAt });
        }
        for (const state of ['PUBLISHED', 'DRAFT'] as const) {
          const sale = await env.prisma.$transaction(async (tx) => {
            const sale = await tx.flashSale.create({
              data: {
                name: `Flash kiểm thử ${state}`,
                state,
                startAt: new Date(now + 20000),
                endAt: new Date(now + 600000),
                createdById: env.system.user.id,
                items: {
                  create: {
                    variantId: env.variant.id,
                    flashPrice: 80000,
                    referencePrice: 100000,
                    totalQuota: 50,
                    maxQuantityPerUser: 3,
                  },
                },
              },
            });
            await schedulePromotion(
              tx,
              'FLASH_SALE_ACTIVE',
              sale.id,
              sale.startAt,
              state === 'PUBLISHED',
            );
            return sale;
          });
          references.push({
            id: sale.id,
            kind: state,
            startAt: sale.startAt.toISOString(),
          });
        }
        writeFileSync(
          `${directory}/promotion-fixtures.json`,
          JSON.stringify(references, null, 2),
        );
        console.log(JSON.stringify({ promotions: references }));
      }
      if (line === 'save') {
        probe.save();
        console.log('PROBE_SAVED');
      }
      if (line === 'cod') return;
      if (line === 'worker-stop') {
        await env.worker.onModuleDestroy();
        console.log('WORKER_STOPPED');
      }
      if (line === 'worker-start') {
        env.worker.onModuleInit();
        console.log('WORKER_STARTED');
      }
    })().catch((error: unknown) =>
      console.error(
        error instanceof Error ? error.message : 'Test action failed',
      ),
    );
  });
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
