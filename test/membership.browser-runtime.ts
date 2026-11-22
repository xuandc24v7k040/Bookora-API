import { createInterface } from 'node:readline';
import { createNotificationEnvironment } from './helpers/notification-environment';
import { MembershipThresholdsService } from '@/modules/membership/membership-thresholds.service';
import { MembershipQueryService } from '@/modules/membership/membership-query.service';
import { backfillMembership } from '@/modules/membership/membership-backfill';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { AdminOrdersService } from '@/modules/admin-orders/admin-orders.service';
import { CustomerOrdersService } from '@/modules/customer-orders/customer-orders.service';

async function main() {
  const env = await createNotificationEnvironment(18000, true);
  await env.worker.onModuleDestroy();
  env.config.set('NOTIFICATIONS_POLL_MS', 5000);
  env.worker.onModuleInit();
  for (let n = 0; n < 13; n++) {
    const placed = await env.place('COD', env.branches[n % 2].id);
    const date = new Date(Date.now() - (14 - n) * 86400000);
    await env.prisma.order.update({
      where: { id: placed.orderId },
      data: {
        status: 'COMPLETED',
        subtotalAmount: 500000,
        totalAmount: 530000,
        shippingFee: 30000,
        items: {
          updateMany: {
            where: {},
            data: {
              lineTotal: 500000,
              unitPrice: 500000,
              originalPrice: 500000,
              catalogEffectivePrice: 500000,
            },
          },
        },
        payment: { update: { status: 'PAID', paidAt: date, amount: 530000 } },
        statusHistories: {
          create: {
            fromStatus: 'SHIPPING',
            toStatus: 'COMPLETED',
            actorType: 'ADMIN',
            branchId: env.branches[n % 2].id,
            createdAt: date,
          },
        },
      },
    });
  }
  console.log(
    'BACKFILL_DRY',
    JSON.stringify(await backfillMembership(env.prisma)),
  );
  console.log(
    'BACKFILL_APPLY',
    JSON.stringify(
      await backfillMembership(env.prisma, { apply: true, batchSize: 4 }),
    ),
  );
  console.log(
    'BACKFILL_RERUN',
    JSON.stringify(
      await backfillMembership(env.prisma, { apply: true, batchSize: 4 }),
    ),
  );
  for (let n = 0; n < 24; n++)
    await env.account(`member-${String(n).padStart(2, '0')}`, 'CUSTOMER');
  await env.prisma.user.update({
    where: { id: env.customerA.user.id },
    data: {
      fullName:
        'Khách hàng kiểm thử hạng Vàng có tên rất dài để xác minh nội dung và tooltip',
    },
  });
  const coupons = env.app.get(CouponsService),
    now = Date.now();
  for (let n = 0; n < 5; n++)
    await coupons.save({
      code: `GOLD${n + 1}`,
      name: `Chiến dịch thành viên ${n + 1}`,
      type: n % 2 ? 'SHIPPING' : 'ORDER',
      visibility: 'PUBLIC',
      minimumMembershipTier: 'GOLD',
      discountType: 'FIXED_AMOUNT',
      discountValue: 10000 + n * 1000,
      minOrderAmount: 50000,
      startAt: new Date(now - 60000).toISOString(),
      endAt: new Date(now + 86400000).toISOString(),
      isActive: true,
    });
  await coupons.save({
    code: 'PRIVATE_DIAMOND',
    name: 'Ưu đãi riêng Kim cương',
    type: 'ORDER',
    visibility: 'PRIVATE',
    minimumMembershipTier: 'DIAMOND',
    discountType: 'FIXED_AMOUNT',
    discountValue: 20000,
    startAt: new Date(now - 60000).toISOString(),
    endAt: new Date(now + 86400000).toISOString(),
    isActive: true,
  });
  await coupons.save({
    code: 'DIAMOND_PUBLIC',
    name: 'Chiến dịch Kim cương',
    type: 'ORDER',
    visibility: 'PUBLIC',
    minimumMembershipTier: 'DIAMOND',
    discountType: 'FIXED_AMOUNT',
    discountValue: 20000,
    startAt: new Date(now - 60000).toISOString(),
    endAt: new Date(now + 86400000).toISOString(),
    isActive: true,
  });
  // A real checkout is placed and advanced to SHIPPING; final completion is left for the Admin browser.
  await env.prisma.productVariant.update({
    where: { id: env.variant.id },
    data: { originalPrice: 3500000 },
  });
  const order = await env.place();
  const actor = await env.principal(env.admin);
  actor.permissions = actor.branchAssignments[0].permissions;
  const context = {
    scope: 'SELECTED' as const,
    selectedBranchId: env.branches[0].id,
    allowedBranchIds: actor.allowedBranchIds,
  };
  for (const targetStatus of ['CONFIRMED', 'PACKING', 'SHIPPING'] as const)
    await env.app
      .get(AdminOrdersService)
      .transition(actor, context, order.orderId, { targetStatus });
  await env.app
    .get(CustomerOrdersService)
    .confirmReceived(await env.principal(), order.orderId);
  // Keep a cart ready to exercise the real Coupon dialog without a new purchase.
  const cart = await env.prisma.cart.findUniqueOrThrow({
    where: { userId: env.customerA.user.id },
  });
  await env.prisma.cartItem.create({
    data: {
      cartId: cart.id,
      variantId: env.variant.id,
      quantity: 1,
      lastKnownUnitPrice: 3500000,
    },
  });
  console.log(
    JSON.stringify({
      ready: true,
      database: env.infra.database.databaseName,
      api: env.url,
      orderId: order.orderId,
      branchId: env.branches[0].id,
      users: ['customer-a', 'customer-b', 'branch-admin', 'super-admin'].map(
        (name) => `${name}@realtime.example.test`,
      ),
      password: env.password,
      summary: await env.app
        .get(MembershipQueryService)
        .summary(env.customerA.user.id),
    }),
  );
  const input = createInterface({ input: process.stdin });
  input.on('line', (line) => {
    void (async () => {
      if (line === 'metrics')
        console.log(
          JSON.stringify({
            summary: await env.app
              .get(MembershipQueryService)
              .summary(env.customerA.user.id),
            credits: await env.prisma.membershipTransaction.count(),
            history: await env.prisma.membershipTierHistory.findMany({
              where: { userId: env.customerA.user.id },
            }),
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
      if (line === 'upgrade') {
        await env.app
          .get(AdminOrdersService)
          .transition(actor, context, order.orderId, {
            targetStatus: 'COMPLETED',
          });
        console.log('UPGRADE_COMMITTED');
      }
      if (line === 'backfill')
        console.log(
          JSON.stringify(await backfillMembership(env.prisma, { apply: true })),
        );
      if (line === 'stop') {
        input.close();
        await env.app.get(MembershipThresholdsService).onModuleDestroy();
        await env.app.close();
        console.log('STOPPED_DATABASE_RETAINED');
        process.exit(0);
      }
    })().catch(() => console.error('RUNTIME_ACTION_FAILED'));
  });
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Runtime startup failed',
  );
  process.exitCode = 1;
});
