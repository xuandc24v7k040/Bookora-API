import { createInterface } from 'node:readline';
import { notificationRuntimeActions } from './helpers/notification-runtime-actions';
import { createNotificationEnvironment } from './helpers/notification-environment';
import { AdminOrdersService } from '@/modules/admin-orders/admin-orders.service';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { schedulePromotion } from '@/modules/notifications/notification-intents';

async function main() {
  const env = await createNotificationEnvironment(18000, true);
  const extraAction = notificationRuntimeActions(env);
  const actor = await env.principal(env.admin);
  actor.permissions = actor.branchAssignments[0].permissions;
  for (let n = 0; n < 7; n++) {
    const order = await env.place('COD', env.branches[n % 2].id);
    await env.app.get(AdminOrdersService).transition(
      actor,
      {
        scope: 'SELECTED',
        selectedBranchId: env.branches[n % 2].id,
        allowedBranchIds: actor.allowedBranchIds,
      },
      order.orderId,
      { targetStatus: 'CONFIRMED' },
    );
  }
  console.log(
    JSON.stringify({
      ready: true,
      api: env.url,
      database: env.infra.database.databaseName,
      users: [
        'customer-a',
        'branch-admin',
        'cashier',
        'staff',
        'readonly',
        'super-admin',
      ].map((name) => `${name}@realtime.example.test`),
      password: env.password,
      branches: env.branches.map(({ id, name }) => ({ id, name })),
    }),
  );
  const input = createInterface({ input: process.stdin });
  input.on('line', (line) => {
    void (async () => {
      if (await extraAction(line)) return;
      if (line === 'stop') {
        input.close();
        await env.close();
        process.exit(0);
      }
      if (line === 'order') {
        const order = await env.place();
        await env.app.get(AdminOrdersService).transition(
          actor,
          {
            scope: 'SELECTED',
            selectedBranchId: env.branches[0].id,
            allowedBranchIds: actor.allowedBranchIds,
          },
          order.orderId,
          { targetStatus: 'CONFIRMED' },
        );
        console.log('ORDER_COMMITTED');
      }
      if (line === 'promotion') {
        const now = Date.now();
        const coupon = await env.app.get(CouponsService).save({
          code: `RT${now}`,
          name: 'Ưu đãi kiểm thử realtime',
          type: 'ORDER',
          visibility: 'PUBLIC',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          startAt: new Date(now + 5000).toISOString(),
          endAt: new Date(now + 600000).toISOString(),
          isActive: true,
        });
        console.log(`PROMOTION_SCHEDULED:${coupon.id}`);
      }
      if (line === 'flash') {
        await env.prisma.$transaction(async (tx) => {
          const sale = await tx.flashSale.create({
            data: {
              name: 'Flash Sale kiểm thử realtime',
              state: 'PUBLISHED',
              startAt: new Date(Date.now() + 3000),
              endAt: new Date(Date.now() + 600000),
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
            true,
          );
        });
        console.log('FLASH_SCHEDULED');
      }
      if (line === 'metrics')
        console.log(
          JSON.stringify({
            notifications: await env.prisma.notification.groupBy({
              by: ['type'],
              _count: true,
            }),
            jobs: await env.prisma.notificationDispatch.groupBy({
              by: ['state'],
              _count: true,
            }),
          }),
        );
    })().catch((error: unknown) =>
      console.error(
        error instanceof Error ? error.message : 'Runtime command failed',
      ),
    );
  });
  process.once('SIGINT', () => {
    void env.close().then(() => process.exit(0));
  });
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
