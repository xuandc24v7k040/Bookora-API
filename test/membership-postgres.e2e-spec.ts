import request from 'supertest';
import { createHmac } from 'node:crypto';
import { io } from 'socket.io-client';
import { ulid } from 'ulid';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { PaymentsService } from '@/modules/payments/payments.service';
import { serializeVnpayParams } from '@/modules/integrations/vnpay/vnpay.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { creditMembershipOrder } from '@/modules/membership/membership-credit';
import { backfillMembership } from '@/modules/membership/membership-backfill';
import { MembershipThresholdsService } from '@/modules/membership/membership-thresholds.service';
import { MembershipQueryService } from '@/modules/membership/membership-query.service';
import { AdminOrdersService } from '@/modules/admin-orders/admin-orders.service';
import { CustomerOrdersService } from '@/modules/customer-orders/customer-orders.service';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { createNotificationEnvironment } from './helpers/notification-environment';

describe('Membership PostgreSQL/API integration', () => {
  jest.setTimeout(180000);
  let env: Awaited<ReturnType<typeof createNotificationEnvironment>>;
  beforeAll(async () => {
    env = await createNotificationEnvironment();
    await env.app.get(MembershipThresholdsService).onModuleDestroy();
  });
  afterAll(async () => {
    if (env) await env.close();
  });
  const api = (path: string, who: typeof env.customerA) =>
    request(env.app.getHttpServer())
      .get(`/api/v1/${path}`)
      .set('Cookie', who.cookie);
  async function qualified(
    amount: number,
    who = env.customerA,
    paid = true,
    completed = true,
  ) {
    const order = await env.place('COD', env.branches[0].id, who);
    await env.prisma.order.update({
      where: { id: order.orderId },
      data: {
        status: completed ? 'COMPLETED' : 'SHIPPING',
        subtotalAmount: amount,
        orderCouponDiscountAmount: 0,
        items: {
          updateMany: {
            where: {},
            data: { lineTotal: amount, couponDiscountAmount: 0 },
          },
        },
        payment: {
          update: {
            status: paid ? 'PAID' : 'UNPAID',
            paidAt: paid ? new Date() : null,
          },
        },
        ...(completed
          ? {
              statusHistories: {
                create: {
                  fromStatus: 'SHIPPING',
                  toStatus: 'COMPLETED',
                  actorType: 'ADMIN',
                  branchId: env.branches[0].id,
                },
              },
            }
          : {}),
      },
    });
    return order.orderId;
  }
  const credit = (id: string, source: 'ORDER' | 'BACKFILL' = 'ORDER') =>
    runSerializableTransaction(
      env.prisma,
      (tx) => creditMembershipOrder(tx, id, source),
      8,
    );
  it('fresh/legacy Customer reads Bronze without creating rows on GET', async () => {
    const result = await api('account/membership', env.customerA).expect(200);
    expect(result.body.data).toMatchObject({
      currentTier: 'BRONZE',
      lifetimeSpend: 0,
      achievedAt: null,
    });
    expect(await env.prisma.customerMembership.count()).toBe(0);
  });
  it('enforces owner scope, roles and customer-only enrollment', async () => {
    for (const who of [env.admin, env.cashier, env.staff, env.system])
      await api('account/membership', who).expect(403);
    for (const who of [env.customerA, env.admin, env.cashier, env.staff])
      await api('admin/membership/members', who).expect(403);
    await api('admin/membership/members', env.system).expect(200);
    await expect(
      env.prisma.customerMembership.create({
        data: { userId: env.admin.user.id },
      }),
    ).rejects.toThrow();
  });
  it('does not credit either condition alone or receipt flag alone; credits when the second becomes true', async () => {
    const unpaid = await qualified(100000, env.customerB, false, true),
      incomplete = await qualified(200000, env.customerB, true, false);
    expect(await credit(unpaid)).toBe('INELIGIBLE');
    expect(await credit(incomplete)).toBe('INELIGIBLE');
    await env.prisma.order.update({
      where: { id: incomplete },
      data: { customerConfirmedReceivedAt: new Date() },
    });
    expect(await credit(incomplete)).toBe('INELIGIBLE');
    await env.prisma.payment.update({
      where: { orderId: unpaid },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await env.prisma.order.update({
      where: { id: incomplete },
      data: { status: 'COMPLETED' },
    });
    expect(await credit(unpaid)).toBe('CREDITED');
    expect(await credit(incomplete)).toBe('CREDITED');
    expect(
      (
        await env.prisma.customerMembership.findUniqueOrThrow({
          where: { userId: env.customerB.user.id },
        })
      ).lifetimeSpend.toNumber(),
    ).toBe(300000);
  });
  it('rolls ledger, rank, history and outbox back together', async () => {
    const id = await qualified(2000000);
    await expect(
      env.prisma.$transaction(async (tx) => {
        await creditMembershipOrder(tx, id);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    expect(
      await env.prisma.membershipTransaction.count({ where: { orderId: id } }),
    ).toBe(0);
    expect(
      await env.prisma.membershipTierHistory.count({
        where: { userId: env.customerA.user.id },
      }),
    ).toBe(0);
  });
  it('parallel distinct orders and duplicate replay preserve spend and one direct max-tier upgrade', async () => {
    const first = await qualified(6500000);
    const second = await qualified(500000);
    await Promise.all([credit(first), credit(second), credit(first)]);
    const member = await env.prisma.customerMembership.findUniqueOrThrow({
      where: { userId: env.customerA.user.id },
    });
    expect(member.lifetimeSpend.toNumber()).toBe(7000000);
    expect(member.currentTier).toBe('GOLD');
    expect(
      await env.prisma.membershipTransaction.count({
        where: { orderId: first },
      }),
    ).toBe(1);
    const histories = await env.prisma.membershipTierHistory.findMany({
      where: { userId: env.customerA.user.id },
    });
    expect(histories).toHaveLength(1);
    expect(histories[0].fromTier).toBe('BRONZE');
    expect(histories[0].toTier).toBe('GOLD');
    for (let n = 0; n < 10; n++) {
      await env.worker.tick(first);
      await env.worker.tick(second);
    }
    expect(
      await env.prisma.notification.count({
        where: { userId: env.customerA.user.id, type: 'MEMBERSHIP_UPGRADED' },
      }),
    ).toBe(1);
    await credit(first);
    await env.worker.tick(first);
    expect(
      await env.prisma.notification.count({
        where: { userId: env.customerA.user.id, type: 'MEMBERSHIP_UPGRADED' },
      }),
    ).toBe(1);
  });
  it('DB rejects downgrade and a second credit', async () => {
    await expect(
      env.prisma.customerMembership.update({
        where: { userId: env.customerA.user.id },
        data: { currentTier: 'BRONZE' },
      }),
    ).rejects.toThrow();
    const old = await env.prisma.membershipTransaction.findFirstOrThrow();
    await expect(
      env.prisma.membershipTransaction.create({
        data: {
          orderId: old.orderId,
          userId: old.userId,
          amount: 1,
          source: 'ORDER',
        },
      }),
    ).rejects.toThrow();
  });
  it('safe backfill dry-run/apply/interruption/resume/rerun reconcile and never notify history', async () => {
    const before = await env.prisma.notificationDispatch.count({
      where: { kind: 'MEMBERSHIP_UPGRADED' },
    });
    const dry = await backfillMembership(env.prisma);
    expect(dry.newlyCredited).toBe(0);
    expect(dry.eligible).toBeGreaterThan(0);
    await backfillMembership(env.prisma, {
      apply: true,
      batchSize: 1,
      maxBatches: 1,
    });
    const result = await backfillMembership(env.prisma, {
      apply: true,
      batchSize: 2,
    });
    expect(result.reconciliationErrors).toBe(0);
    expect(
      (await backfillMembership(env.prisma, { apply: true })).newlyCredited,
    ).toBe(0);
    expect(
      await env.prisma.notificationDispatch.count({
        where: { kind: 'MEMBERSHIP_UPGRADED' },
      }),
    ).toBe(before);
    const [counts] = await env.prisma.$queryRaw<
      Array<{ count: bigint }>
    >`SELECT count(*) FROM membership_transactions t JOIN orders o ON o.id=t.order_id JOIN payments p ON p.order_id=o.id WHERE o.status <> 'COMPLETED' OR p.status <> 'PAID'`;
    expect(Number(counts.count)).toBe(0);
  });
  it('threshold ↑ preserves rank; ↓ promotes with audit, persisted batches and no notification', async () => {
    const service = env.app.get(MembershipThresholdsService),
      before = await env.prisma.notificationDispatch.count({
        where: { kind: 'MEMBERSHIP_UPGRADED' },
      });
    let config = await env.app.get(MembershipQueryService).config();
    await service.save(env.system.user.id, {
      silver: 3000000,
      gold: 9000000,
      diamond: 12000000,
      version: config.version,
    });
    await service.resume();
    expect(
      (await env.app.get(MembershipQueryService).summary(env.customerA.user.id))
        .currentTier,
    ).toBe('GOLD');
    config = await env.app.get(MembershipQueryService).config();
    await service.save(env.system.user.id, {
      silver: 100000,
      gold: 200000,
      diamond: 6000000,
      version: config.version,
    });
    await service.resume();
    expect(
      (await env.app.get(MembershipQueryService).summary(env.customerA.user.id))
        .currentTier,
    ).toBe('DIAMOND');
    expect(await env.prisma.membershipConfigAudit.count()).toBe(2);
    expect(
      await env.prisma.notificationDispatch.count({
        where: { kind: 'MEMBERSHIP_UPGRADED' },
      }),
    ).toBe(before);
    await expect(
      service.save(env.system.user.id, {
        silver: 1,
        gold: 2,
        diamond: 3,
        version: 1,
      }),
    ).rejects.toThrow();
    const fresh = await env.app.get(MembershipQueryService).config();
    await expect(
      service.save(env.system.user.id, {
        silver: 2,
        gold: 2,
        diamond: 3,
        version: fresh.version,
      }),
    ).rejects.toThrow();
  });
  it('minimum tier protects PUBLIC/PRIVATE ORDER/SHIPPING resolve and reservation; legacy coupons work', async () => {
    const service = env.app.get(CouponsService),
      now = Date.now();
    const fresh = await env.account('membership-fresh', 'CUSTOMER');
    for (const type of ['ORDER', 'SHIPPING'] as const)
      for (const visibility of ['PUBLIC', 'PRIVATE'] as const) {
        const coupon = await service.save({
          code: `MEMBER_${type}_${visibility}`,
          name: 'Ưu đãi thành viên',
          type,
          visibility,
          minimumMembershipTier: 'GOLD',
          discountType: 'FIXED_AMOUNT',
          discountValue: 10000,
          startAt: new Date(now - 1000).toISOString(),
          endAt: new Date(now + 600000).toISOString(),
          isActive: true,
        });
        const low = {
            userId: fresh.user.id,
            subtotal: 100000,
            shippingFee: 30000,
          },
          high = { ...low, userId: env.customerA.user.id };
        await expect(
          service.resolve(low, { couponCode: coupon.code }),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'COUPON_MEMBERSHIP_TIER' }),
        });
        const selected = await service.resolve(high, {
          couponCode: coupon.code,
        });
        expect(selected).toHaveLength(1);
        await expect(
          env.prisma.$transaction((tx) =>
            service.redeem(tx, 'invalid-order', low, selected, null),
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'COUPON_MEMBERSHIP_TIER' }),
        });
        expect(
          (await service.publicList(low)).some(
            (row) => row.code === coupon.code,
          ),
        ).toBe(false);
        expect(
          (
            await env.app
              .get(MembershipQueryService)
              .coupons(env.customerA.user.id, {})
          ).items.some((row) => row.code === coupon.code),
        ).toBe(visibility === 'PUBLIC');
      }
    const legacy = await service.save({
      code: 'MEMBER_LEGACY',
      name: 'Không giới hạn',
      type: 'ORDER',
      visibility: 'PUBLIC',
      discountType: 'FIXED_AMOUNT',
      discountValue: 1000,
      startAt: new Date(now - 1000).toISOString(),
      endAt: new Date(now + 600000).toISOString(),
      isActive: true,
    });
    expect(
      await service.resolve(
        { userId: fresh.user.id, subtotal: 100000, shippingFee: 30000 },
        { couponCode: legacy.code },
      ),
    ).toHaveLength(1);
  });
  it('actual COD receipt→Admin completion hook credits only after completion', async () => {
    const order = await env.place();
    const admin = await env.principal(env.admin);
    admin.permissions = admin.branchAssignments[0].permissions;
    const context = {
      scope: 'SELECTED' as const,
      selectedBranchId: env.branches[0].id,
      allowedBranchIds: admin.allowedBranchIds,
    };
    for (const targetStatus of ['CONFIRMED', 'PACKING', 'SHIPPING'] as const)
      await env.app
        .get(AdminOrdersService)
        .transition(admin, context, order.orderId, { targetStatus });
    await env.app
      .get(CustomerOrdersService)
      .confirmReceived(await env.principal(), order.orderId);
    expect(
      await env.prisma.membershipTransaction.count({
        where: { orderId: order.orderId },
      }),
    ).toBe(0);
    await env.app
      .get(AdminOrdersService)
      .transition(admin, context, order.orderId, { targetStatus: 'COMPLETED' });
    expect(
      await env.prisma.membershipTransaction.count({
        where: { orderId: order.orderId },
      }),
    ).toBe(1);
  });
  it('admin numeric sorting places missing profiles at zero and paginates/searches without GET enrollment', async () => {
    const who = await env.account('unprovisioned-member', 'CUSTOMER');
    const service = env.app.get(MembershipQueryService);
    const descending = await service.members({});
    expect(descending.items[0].lifetimeSpend).toBeGreaterThan(0);
    const filtered = await service.members({ search: who.user.email });
    expect(filtered.totalItems).toBe(1);
    expect(filtered.items[0].currentTier).toBe('BRONZE');
    expect(filtered.items[0].lifetimeSpend).toBe(0);
    expect(
      await env.prisma.customerMembership.findUnique({
        where: { userId: who.user.id },
      }),
    ).toBeNull();
  });
  it('credits frozen catalog/Flash pricing minus ORDER coupon without shipping coupon or shipping fee', async () => {
    const who = await env.account('golden-money', 'CUSTOMER'),
      id = await qualified(175000, who);
    await env.prisma.order.update({
      where: { id },
      data: {
        orderCouponDiscountAmount: 25000,
        shippingCouponDiscountAmount: 10000,
        shippingFee: 30000,
        totalAmount: 170000,
        discountAmount: 75000,
        items: {
          updateMany: {
            where: {},
            data: {
              lineTotal: 175000,
              couponDiscountAmount: 25000,
              unitPrice: 175000,
              originalPrice: 250000,
              catalogEffectivePrice: 200000,
              flashPrice: 175000,
            },
          },
        },
      },
    });
    await credit(id);
    expect(
      (
        await env.prisma.membershipTransaction.findUniqueOrThrow({
          where: { orderId: id },
        })
      ).amount.toNumber(),
    ).toBe(150000);
  });
  it('actual checkout refuses a preview after the authenticated tier changes', async () => {
    const who = await env.account('stale-membership-preview', 'CUSTOMER');
    await env.place('COD', env.branches[0].id, who);
    const cart = await env.prisma.cart.findUniqueOrThrow({
      where: { userId: who.user.id },
    });
    const item = await env.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId: env.variant.id,
        quantity: 1,
        lastKnownUnitPrice: 100000,
      },
    });
    const address = await env.prisma.userAddress.findFirstOrThrow({
      where: { userId: who.user.id },
    });
    const input = {
      selectedCartItemIds: [item.id],
      paymentMethod: 'COD' as const,
      address: {
        source: 'SAVED_ADDRESS' as const,
        customerAddressId: address.id,
      },
    };
    const actor = await env.principal(who),
      checkout = env.app.get(CheckoutService);
    const preview = await checkout.preview(actor, env.branches[0].id, input);
    const order = await qualified(200000, who);
    await credit(order);
    await env.prisma.branchProductStock.update({
      where: {
        branchId_variantId: {
          branchId: env.branches[0].id,
          variantId: env.variant.id,
        },
      },
      data: { quantity: { increment: 1 } },
    });
    // qualified() uses the fixture cart; restore the same selection so only membership differs.
    await env.prisma.cartItem.create({
      data: {
        id: item.id,
        cartId: cart.id,
        variantId: env.variant.id,
        quantity: 1,
        lastKnownUnitPrice: 100000,
      },
    });
    await expect(
      checkout.placeCod(actor, env.branches[0].id, {
        ...input,
        previewReference: preview.previewReference,
        idempotencyKey: ulid(),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CHECKOUT_PREVIEW_CHANGED' }),
    });
  });
  it('a committed tier promotion reaches the real websocket and survives disconnect via REST', async () => {
    const who = await env.account('socket-membership', 'CUSTOMER');
    const socket = io(`${env.url}/realtime`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Cookie: who.cookie, Origin: 'http://localhost:15173' },
      autoConnect: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
        socket.connect();
      });
      const received: unknown[] = [];
      socket.on('notification.changed', (data) => received.push(data));
      const id = await qualified(200000, who);
      await credit(id);
      for (let n = 0; n < 10; n++) await env.worker.tick(id);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(received.length).toBeGreaterThan(0);
      socket.disconnect();
      const result = await api('notifications?unreadOnly=true', who).expect(
        200,
      );
      expect(
        result.body.data.items.filter(
          (item: { type: string }) => item.type === 'MEMBERSHIP_UPGRADED',
        ),
      ).toHaveLength(1);
    } finally {
      socket.disconnect();
    }
  });
  it('membership promotion campaigns target only active customers who held the required rank at the cutoff', async () => {
    const coupon = await env.app.get(CouponsService).save({
      code: 'MEMBERSHIP_AUDIENCE',
      name: 'Chiến dịch theo hạng',
      type: 'ORDER',
      visibility: 'PUBLIC',
      minimumMembershipTier: 'DIAMOND',
      discountType: 'FIXED_AMOUNT',
      discountValue: 1000,
      startAt: new Date(Date.now() - 1000).toISOString(),
      endAt: new Date(Date.now() + 600000).toISOString(),
      isActive: true,
    });
    for (let n = 0; n < 30; n++) await env.worker.tick();
    const notifications = await env.prisma.notification.findMany({
      where: { referenceId: coupon.id },
      include: { user: { select: { type: true, isActive: true } } },
    });
    expect(notifications.length).toBeGreaterThan(0);
    for (const row of notifications) {
      expect(row.user).toEqual({ type: 'CUSTOMER', isActive: true });
      const history = await env.prisma.membershipTierHistory.findFirst({
        where: { userId: row.userId, toTier: 'DIAMOND' },
      });
      expect(history).not.toBeNull();
    }
  });
  it('VNPay verified paid-before-completed and duplicate callbacks credit exactly once at final completion', async () => {
    const who = await env.account('vnpay-membership', 'CUSTOMER'),
      order = await env.place('VNPAY', env.branches[0].id, who);
    const transaction = await env.prisma.paymentTransaction.findFirstOrThrow({
      where: { payment: { orderId: order.orderId } },
    });
    const params = {
      vnp_TmnCode: env.config.getOrThrow<string>('payment.vnpay.tmnCode'),
      vnp_TxnRef: transaction.merchantTxnRef,
      vnp_Amount: String(Number(transaction.amount) * 100),
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    };
    const signed = {
      ...params,
      vnp_SecureHash: createHmac(
        'sha512',
        env.config.getOrThrow<string>('payment.vnpay.hashSecret'),
      )
        .update(serializeVnpayParams(params))
        .digest('hex'),
    };
    const payments = env.app.get(PaymentsService);
    await payments.handleVnpayIpn({ ...signed, vnp_SecureHash: 'bad' });
    expect(await credit(order.orderId)).toBe('INELIGIBLE');
    await payments.handleVnpayIpn(signed);
    await payments.handleVnpayIpn(signed);
    expect(await credit(order.orderId)).toBe('INELIGIBLE');
    const admin = await env.principal(env.admin);
    admin.permissions = admin.branchAssignments[0].permissions;
    const context = {
      scope: 'SELECTED' as const,
      selectedBranchId: env.branches[0].id,
      allowedBranchIds: admin.allowedBranchIds,
    };
    for (const targetStatus of ['CONFIRMED', 'PACKING', 'SHIPPING'] as const)
      await env.app
        .get(AdminOrdersService)
        .transition(admin, context, order.orderId, { targetStatus });
    await env.app
      .get(CustomerOrdersService)
      .confirmReceived(await env.principal(who), order.orderId);
    await env.app
      .get(AdminOrdersService)
      .transition(admin, context, order.orderId, { targetStatus: 'COMPLETED' });
    await payments.handleVnpayIpn(signed);
    expect(
      await env.prisma.membershipTransaction.count({
        where: { orderId: order.orderId },
      }),
    ).toBe(1);
  });
  it('threshold HTTP validation rejects malformed values, frozen Bronze and missing CSRF', async () => {
    const config = await env.app.get(MembershipQueryService).config();
    for (const silver of [0, -1, 1.2, 'abc', '2e6', Number.MAX_VALUE])
      await request(env.app.getHttpServer())
        .patch('/api/v1/admin/membership/config')
        .set('Cookie', env.system.cookie)
        .set('X-CSRF-Token', env.csrf)
        .send({
          silver,
          gold: config.gold,
          diamond: config.diamond,
          version: config.version,
        })
        .expect(400);
    await request(env.app.getHttpServer())
      .patch('/api/v1/admin/membership/config')
      .set('Cookie', env.system.cookie)
      .send({ silver: 1, gold: 2, diamond: 3, version: config.version })
      .expect(403);
    await request(env.app.getHttpServer())
      .patch('/api/v1/admin/membership/config')
      .set('Cookie', env.system.cookie)
      .set('X-CSRF-Token', env.csrf)
      .send({
        silver: 1,
        gold: 2,
        diamond: 3,
        bronze: 1,
        version: config.version,
      })
      .expect(400);
  });
  it('does not invent achievement dates when any historical order has incomplete chronology', async () => {
    const who = await env.account('incomplete-chronology', 'CUSTOMER');
    const first = await qualified(100000, who),
      second = await qualified(100000, who);
    await env.prisma.payment.update({
      where: { orderId: first },
      data: { paidAt: null },
    });
    await credit(first, 'BACKFILL');
    await credit(second, 'BACKFILL');
    const member = await env.prisma.customerMembership.findUniqueOrThrow({
      where: { userId: who.user.id },
    });
    expect(member.currentTier).toBe('GOLD');
    expect(member.achievedAt).toBeNull();
    expect(
      await env.prisma.membershipTierHistory.count({
        where: { userId: who.user.id, effectiveAt: { not: null } },
      }),
    ).toBe(0);
    expect(
      await env.prisma.notificationDispatch.count({
        where: {
          kind: 'MEMBERSHIP_UPGRADED',
          referenceId: { in: [first, second] },
        },
      }),
    ).toBe(0);
  });
});
