import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { ulid } from 'ulid';
import { JwtService } from '@nestjs/jwt';
import { AdminOrdersService } from '@/modules/admin-orders/admin-orders.service';
import { CustomerOrdersService } from '@/modules/customer-orders/customer-orders.service';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { PaymentsService } from '@/modules/payments/payments.service';
import { serializeVnpayParams } from '@/modules/integrations/vnpay/vnpay.service';
import {
  enqueueOrderNotification,
  schedulePromotion,
} from '@/modules/notifications/notification-intents';
import { NotificationWorker } from '@/modules/notifications/notification-worker.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher';
import {
  cancelOrderInTransaction,
  cancellableOrderInclude,
} from '@/modules/orders/order-cancellation';
import { createNotificationEnvironment } from './helpers/notification-environment';

describe('Notifications — PostgreSQL, REST and real Socket.IO', () => {
  jest.setTimeout(180000);
  let env: Awaited<ReturnType<typeof createNotificationEnvironment>>;
  const sockets: Socket[] = [];
  const origin = 'http://localhost:15173';
  beforeAll(async () => {
    env = await createNotificationEnvironment();
  });
  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await env?.close();
  });
  async function drain() {
    for (let i = 0; i < 30; i++) await env.worker.tick();
  }
  const api = () => request(env.app.getHttpServer());
  const path = '/api/v1/notifications';
  function context(n = 0) {
    return {
      scope: 'SELECTED' as const,
      selectedBranchId: env.branches[n].id,
      allowedBranchIds: env.branches.map((b) => b.id),
    };
  }
  async function adminActor() {
    const actor = await env.principal(env.admin);
    actor.permissions = actor.branchAssignments[0].permissions;
    return actor;
  }
  async function connect(
    cookie: string,
    requestedOrigin = origin,
    transport: 'websocket' | 'polling' = 'websocket',
  ) {
    const socket = io(`${env.url}/realtime`, {
      transports: [transport],
      reconnection: false,
      extraHeaders: { Cookie: cookie, Origin: requestedOrigin },
      autoConnect: false,
    });
    sockets.push(socket);
    const result = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 3000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(true);
      });
      socket.once('connect_error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      socket.connect();
    });
    return { socket, connected: result };
  }
  async function coupon(
    overrides: Partial<Parameters<CouponsService['save']>[0]> = {},
  ) {
    return env.app.get(CouponsService).save({
      code: `RT${ulid()}`,
      name: 'Ưu đãi thông báo',
      type: 'ORDER',
      visibility: 'PUBLIC',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      startAt: new Date(Date.now() - 1000).toISOString(),
      endAt: new Date(Date.now() + 3600000).toISOString(),
      isActive: true,
      ...overrides,
    });
  }
  async function intentCount(orderId: string) {
    return env.prisma.notificationDispatch.count({
      where: { referenceId: orderId },
    });
  }
  it('COD commits one operation notification per eligible recipient, no self/customer/system/read-only', async () => {
    const result = await env.place();
    await drain();
    const rows = await env.prisma.notification.findMany({
      where: { referenceId: result.orderId },
    });
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [env.admin.user.id, env.cashier.user.id, env.staff.user.id].sort(),
    );
    expect(
      rows.every(
        (r) => r.branchId === env.branches[0].id && r.type === 'ORDER_NEW_COD',
      ),
    ).toBe(true);
    await drain();
    expect(
      await env.prisma.notification.count({
        where: { referenceId: result.orderId },
      }),
    ).toBe(3);
  });
  it('domain rollback atomically removes its dispatch intent', async () => {
    const key = ulid();
    await expect(
      env.prisma.$transaction(async (tx) => {
        await enqueueOrderNotification(tx, {
          eventKey: key,
          kind: 'ORDER_NEW_COD',
          orderId: ulid(),
          branchId: env.branches[0].id,
        });
        throw new Error('controlled rollback');
      }),
    ).rejects.toThrow('controlled rollback');
    expect(
      await env.prisma.notificationDispatch.count({ where: { eventKey: key } }),
    ).toBe(0);
  });
  it('CONFIRMED/PACKING/SHIPPING, customer receipt and COMPLETED remain separate, no note event', async () => {
    const order = await env.place(),
      admin = await adminActor();
    const service = env.app.get(AdminOrdersService);
    for (const status of ['CONFIRMED', 'PACKING', 'SHIPPING'] as const)
      await service.transition(admin, context(), order.orderId, {
        targetStatus: status,
      });
    await service.updateInternalNote(admin, context(), order.orderId, {
      note: 'Kiểm thử nội bộ',
    });
    const before = await intentCount(order.orderId);
    const customer = await env.principal();
    await env.app
      .get(CustomerOrdersService)
      .confirmReceived(customer, order.orderId);
    await env.app
      .get(CustomerOrdersService)
      .confirmReceived(customer, order.orderId);
    expect(await intentCount(order.orderId)).toBe(before + 1);
    expect(
      (
        await env.prisma.order.findUniqueOrThrow({
          where: { id: order.orderId },
        })
      ).status,
    ).toBe('SHIPPING');
    await service.transition(admin, context(), order.orderId, {
      targetStatus: 'COMPLETED',
    });
    await drain();
    const rows = await env.prisma.notification.findMany({
      where: { referenceId: order.orderId },
    });
    expect(
      rows
        .filter((r) => r.userId === env.customerA.user.id)
        .map((r) => r.type)
        .sort(),
    ).toEqual(
      [
        'ORDER_CONFIRMED',
        'ORDER_PACKING',
        'ORDER_SHIPPING',
        'ORDER_COMPLETED',
      ].sort(),
    );
    expect(rows.filter((r) => r.type === 'ORDER_RECEIVED')).toHaveLength(3);
  });
  it('customer cancellation targets branch; admin cancellation targets the customer', async () => {
    const first = await env.place(),
      second = await env.place();
    await env.app
      .get(CustomerOrdersService)
      .cancel(await env.principal(), first.orderId);
    await env.app
      .get(AdminOrdersService)
      .cancel(await adminActor(), context(), second.orderId, {
        reason: 'Kiểm thử hủy hợp lệ',
      });
    await drain();
    expect(
      await env.prisma.notification.count({
        where: {
          referenceId: first.orderId,
          type: 'ORDER_CUSTOMER_CANCELLED',
          userId: env.customerA.user.id,
        },
      }),
    ).toBe(0);
    expect(
      await env.prisma.notification.count({
        where: { referenceId: first.orderId, type: 'ORDER_CUSTOMER_CANCELLED' },
      }),
    ).toBe(3);
    expect(
      await env.prisma.notification.count({
        where: {
          referenceId: second.orderId,
          type: 'ORDER_ADMIN_CANCELLED',
          userId: env.customerA.user.id,
        },
      }),
    ).toBe(1);
  });
  it('verified VNPay emits once; pending, invalid signature/amount and duplicate callbacks never emit phantom jobs', async () => {
    const order = await env.place('VNPAY');
    expect(await intentCount(order.orderId)).toBe(0);
    const transaction = await env.prisma.paymentTransaction.findFirstOrThrow({
      where: { payment: { orderId: order.orderId } },
    });
    const sign = (overrides: Record<string, string> = {}) => {
      const params = {
        vnp_TmnCode: env.config.getOrThrow<string>('payment.vnpay.tmnCode'),
        vnp_TxnRef: transaction.merchantTxnRef,
        vnp_Amount: String(Number(transaction.amount) * 100),
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        ...overrides,
      };
      return {
        ...params,
        vnp_SecureHash: createHmac(
          'sha512',
          env.config.getOrThrow<string>('payment.vnpay.hashSecret'),
        )
          .update(serializeVnpayParams(params))
          .digest('hex'),
      };
    };
    const payments = env.app.get(PaymentsService);
    await payments.handleVnpayIpn({ ...sign(), vnp_SecureHash: 'bad' });
    await payments.handleVnpayIpn(sign({ vnp_Amount: '100' }));
    expect(await intentCount(order.orderId)).toBe(0);
    await payments.handleVnpayIpn(sign());
    await payments.handleVnpayIpn(sign());
    expect(await intentCount(order.orderId)).toBe(2);
    await drain();
    expect(
      await env.prisma.notification.count({
        where: {
          referenceId: order.orderId,
          type: 'PAYMENT_PAID',
          userId: env.customerA.user.id,
        },
      }),
    ).toBe(1);
    expect(
      await env.prisma.notification.count({
        where: { referenceId: order.orderId, type: 'ORDER_NEW_PAID' },
      }),
    ).toBe(3);
  });
  it('only terminal order expiry creates PAYMENT_TERMINAL, not retryable attempt failure', async () => {
    const result = await env.place('VNPAY');
    await env.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: result.orderId },
        include: cancellableOrderInclude,
      });
      await cancelOrderInTransaction(tx, order, {
        allowedStatuses: new Set(['PENDING_PAYMENT']),
        actorType: 'SYSTEM',
        actorUserId: null,
        actorDisplayName: 'Hệ thống',
        reason: 'Hết thời hạn giữ voucher và thanh toán đơn hàng',
        invalidStatusCode: 'TEST',
      });
    });
    await drain();
    expect(
      await env.prisma.notification.count({
        where: { referenceId: result.orderId, type: 'PAYMENT_TERMINAL' },
      }),
    ).toBe(1);
  });
  it('PUBLIC starts only when due; PRIVATE/inactive/exhausted never broadcast, re-enable cannot duplicate', async () => {
    const future = await coupon({
      startAt: new Date(Date.now() + 3600000).toISOString(),
      endAt: new Date(Date.now() + 7200000).toISOString(),
    });
    const privateCoupon = await coupon({ visibility: 'PRIVATE' });
    const disabled = await coupon({ isActive: false });
    await drain();
    expect(
      await env.prisma.notification.count({
        where: {
          referenceId: { in: [future.id, privateCoupon.id, disabled.id] },
        },
      }),
    ).toBe(0);
    await env.prisma.coupon.update({
      where: { id: future.id },
      data: { startAt: new Date(Date.now() - 1000) },
    });
    await env.prisma.notificationDispatch.update({
      where: { eventKey: `COUPON_ACTIVE:${future.id}` },
      data: { dueAt: new Date(0) },
    });
    await drain();
    const rows = await env.prisma.notification.findMany({
      where: { referenceId: future.id },
    });
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [env.customerA.user.id, env.customerB.user.id].sort(),
    );
    await env.app.get(CouponsService).setActive(future.id, false);
    await env.app.get(CouponsService).setActive(future.id, true);
    await drain();
    expect(
      await env.prisma.notification.count({
        where: { referenceId: future.id },
      }),
    ).toBe(2);
  });
  it('explicitly enabling a legacy inactive public coupon is a new activation, not a rollout backfill', async () => {
    const legacy = await env.prisma.coupon.create({
      data: {
        code: `LEGACY${ulid()}`,
        name: 'Ưu đãi cũ đang tắt',
        type: 'ORDER',
        visibility: 'PUBLIC',
        discountType: 'PERCENTAGE',
        discountValue: 5,
        startAt: new Date(Date.now() - 60000),
        endAt: new Date(Date.now() + 3600000),
        isActive: false,
      },
    });
    expect(
      await env.prisma.notificationDispatch.count({
        where: { referenceId: legacy.id },
      }),
    ).toBe(0);
    await env.app.get(CouponsService).setActive(legacy.id, true);
    await drain();
    expect(
      await env.prisma.notification.count({
        where: { referenceId: legacy.id },
      }),
    ).toBe(2);
  });
  it('end boundary and quota exhaustion skip even when a job was already scheduled', async () => {
    const ended = await coupon(),
      exhausted = await coupon({ usageLimit: 1 });
    const order = await env.place();
    await env.prisma.coupon.update({
      where: { id: ended.id },
      data: { endAt: new Date(0) },
    });
    await env.prisma.couponRedemption.create({
      data: {
        couponId: exhausted.id,
        orderId: order.orderId,
        userId: env.customerA.user.id,
        couponType: 'ORDER',
        couponCodeSnapshot: exhausted.code,
        appliedDiscountAmount: 10,
        status: 'CONSUMED',
      },
    });
    await drain();
    expect(
      await env.prisma.notification.count({
        where: { referenceId: { in: [ended.id, exhausted.id] } },
      }),
    ).toBe(0);
  });
  it('Flash Sale eligibility, future start, cancellation, empty items and restart catch-up', async () => {
    const sales: Array<{ id: string }> = [];
    for (const state of [
      'DRAFT',
      'CANCELLED',
      'STOPPED_EARLY',
      'PUBLISHED',
    ] as const) {
      const sale = await env.prisma.flashSale.create({
        data: {
          name: 'Flash kiểm thử',
          state,
          startAt: new Date(Date.now() - 1000),
          endAt: new Date(Date.now() + 600000),
          createdById: env.system.user.id,
          items: {
            create: {
              variantId: env.variant.id,
              flashPrice: 80000,
              referencePrice: 100000,
              totalQuota: 50,
              maxQuantityPerUser: 2,
            },
          },
        },
      });
      await env.prisma.$transaction((tx) =>
        schedulePromotion(tx, 'FLASH_SALE_ACTIVE', sale.id, sale.startAt, true),
      );
      sales.push(sale);
    }
    await drain();
    expect(
      await env.prisma.notification.count({
        where: { referenceId: { in: sales.slice(0, 3).map((s) => s.id) } },
      }),
    ).toBe(0);
    expect(
      await env.prisma.notification.count({
        where: { referenceId: sales[3].id },
      }),
    ).toBe(2);
  });
  it('two competing workers claim one batch, preserve unique recipient/event and audience cutoff', async () => {
    const campaign = await coupon();
    const other = new NotificationWorker(
      env.prisma,
      env.app.get(RealtimePublisher),
      env.config,
    );
    await Promise.all([env.worker.tick(), other.tick()]);
    await drain();
    expect(
      await env.prisma.notification.count({
        where: { referenceId: campaign.id },
      }),
    ).toBe(2);
    const late = await env.account('late-audience', 'CUSTOMER');
    await drain();
    expect(
      await env.prisma.notification.count({
        where: { referenceId: campaign.id, userId: late.user.id },
      }),
    ).toBe(0);
  });
  it('REST enforces owner/branch/processing permissions, unknown userId rejected, readAt monotonic and current branch mark-all', async () => {
    await api().get(path).expect(401);
    await api().get(path).set('Cookie', env.system.cookie).expect(403);
    await api()
      .get(path)
      .set('Cookie', env.readonly.cookie)
      .set('X-Branch-Id', env.branches[0].id)
      .expect(403);
    await api()
      .get(path)
      .set('Cookie', env.cashier.cookie)
      .set('X-Branch-Id', env.branches[1].id)
      .expect(403);
    await api()
      .get(`${path}?userId=${env.customerB.user.id}`)
      .set('Cookie', env.customerA.cookie)
      .expect(400);
    const own = await env.prisma.notification.findFirstOrThrow({
      where: { userId: env.customerA.user.id },
    });
    await api()
      .post(`${path}/${own.id}/read`)
      .set('Cookie', env.customerB.cookie)
      .set('X-CSRF-Token', env.csrf)
      .expect(404);
    await api()
      .post(`${path}/${own.id}/read`)
      .set('Cookie', env.customerA.cookie)
      .expect(403);
    for (let n = 0; n < 2; n++)
      await api()
        .post(`${path}/${own.id}/read`)
        .set('Cookie', env.customerA.cookie)
        .set('X-CSRF-Token', env.csrf)
        .expect(201);
    const readAt = (
      await env.prisma.notification.findUniqueOrThrow({ where: { id: own.id } })
    ).readAt;
    await api()
      .post(`${path}/${own.id}/read`)
      .set('Cookie', env.customerA.cookie)
      .set('X-CSRF-Token', env.csrf)
      .expect(201);
    expect(
      (
        await env.prisma.notification.findUniqueOrThrow({
          where: { id: own.id },
        })
      ).readAt,
    ).toEqual(readAt);
    const second = await env.place('COD', env.branches[1].id);
    await drain();
    await api()
      .post(`${path}/read-all`)
      .set('Cookie', env.admin.cookie)
      .set('X-Branch-Id', env.branches[0].id)
      .set('X-CSRF-Token', env.csrf)
      .expect(201);
    expect(
      (
        await env.prisma.notification.findFirstOrThrow({
          where: { userId: env.admin.user.id, referenceId: second.orderId },
        })
      ).readAt,
    ).toBeNull();
    const search = await api()
      .get(`${path}?search=kh%C3%B4ng-t%E1%BB%93n-t%E1%BA%A1i&limit=5`)
      .set('Cookie', env.customerA.cookie)
      .expect(200);
    expect(search.body.data.items).toHaveLength(0);
  });
  it('genuine websocket AND polling cookie handshakes succeed; missing/forged/expired/revoked/wrong-origin denied', async () => {
    expect((await connect(env.customerA.cookie)).connected).toBe(true);
    expect(
      (await connect(env.customerA.cookie, origin, 'polling')).connected,
    ).toBe(true);
    for (const cookie of ['', 'accessToken=forged', env.inactive.cookie])
      expect((await connect(cookie)).connected).toBe(false);
    expect(
      (await connect(env.customerA.cookie, 'https://untrusted.example.test'))
        .connected,
    ).toBe(false);
    const expired = new JwtService().sign(
      { sub: env.customerA.user.id, sid: env.customerA.session.id },
      {
        secret: env.config.getOrThrow<string>('auth.jwt.accessSecret'),
        expiresIn: -1,
      },
    );
    expect((await connect(`accessToken=${expired}`)).connected).toBe(false);
  });
  it('future domains reuse the publisher without notification routing; client cannot choose another user room', async () => {
    const a = await connect(env.customerA.cookie),
      b = await connect(env.customerB.cookie);
    expect(a.connected && b.connected).toBe(true);
    const received: unknown[] = [],
      foreign: unknown[] = [];
    a.socket.on('test.domain', (value: unknown) => received.push(value));
    b.socket.on('test.domain', (value: unknown) => foreign.push(value));
    b.socket.emit('join', `user:${env.customerA.user.id}`);
    await env.app
      .get(RealtimePublisher)
      .publishToUser(
        env.customerA.user.id,
        { name: 'test.domain', version: 1, data: { ok: true } },
        (principal) => principal.type === 'CUSTOMER',
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toEqual([{ version: 1, ok: true }]);
    expect(foreign).toEqual([]);
    for (const file of readdirSync('src/modules/realtime').filter((p) =>
      p.endsWith('.ts'),
    ))
      expect(readFileSync(`src/modules/realtime/${file}`, 'utf8')).not.toMatch(
        /from ['"][^'"]*(notifications|orders|coupons|flash-sales)/,
      );
  });
  it('batch cursor and cutoff survive a failed transaction and a restarted worker', async () => {
    await env.prisma.user.createMany({
      data: Array.from({ length: 105 }, (_, n) => ({
        email: `batch-${n}@realtime.example.test`,
        type: 'CUSTOMER' as const,
      })),
    });
    const campaign = await coupon();
    // Fail inside the actual PostgreSQL transaction, not a different Prisma delegate.
    if (!/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(campaign.id))
      throw new Error('Invalid test ULID');
    await env.infra.database
      .runSql(`CREATE FUNCTION test_notification_failure() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'controlled outage'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_notification_failure BEFORE INSERT ON notifications FOR EACH ROW
      WHEN (NEW.reference_id = '${campaign.id}') EXECUTE FUNCTION test_notification_failure();`);
    try {
      await env.worker.tick();
    } finally {
      await env.infra.database.runSql(
        'DROP TRIGGER test_notification_failure ON notifications; DROP FUNCTION test_notification_failure();',
      );
    }
    const failed = await env.prisma.notificationDispatch.findUniqueOrThrow({
      where: { eventKey: `COUPON_ACTIVE:${campaign.id}` },
    });
    expect(failed.cursor).toBeNull();
    expect(failed.attempts).toBe(1);
    expect(
      await env.prisma.notification.count({ where: { dispatchId: failed.id } }),
    ).toBe(0);
    await env.prisma.notificationDispatch.update({
      where: { id: failed.id },
      data: { dueAt: new Date(0) },
    });
    await env.worker.tick();
    const first = await env.prisma.notificationDispatch.findUniqueOrThrow({
      where: { id: failed.id },
    });
    expect(first.cursor).not.toBeNull();
    expect(first.state).toBe('PENDING');
    expect(
      await env.prisma.notification.count({ where: { dispatchId: failed.id } }),
    ).toBe(100);
    const late = await env.account('after-first-batch', 'CUSTOMER');
    const restart = new NotificationWorker(
      env.prisma,
      env.app.get(RealtimePublisher),
      env.config,
    );
    await Promise.all([restart.tick(), env.worker.tick()]);
    expect(
      (
        await env.prisma.notificationDispatch.findUniqueOrThrow({
          where: { id: failed.id },
        })
      ).state,
    ).toBe('DONE');
    expect(
      await env.prisma.notification.count({
        where: { dispatchId: failed.id, userId: late.user.id },
      }),
    ).toBe(0);
    const active = await env.prisma.user.count({
      where: {
        type: 'CUSTOMER',
        isActive: true,
        createdAt: { lte: first.audienceCutoff! },
      },
    });
    expect(
      await env.prisma.notification.count({ where: { dispatchId: failed.id } }),
    ).toBe(active);
  });
  it('socket unavailable preserves committed order and notification history', async () => {
    await drain();
    const order = await env.place();
    const offline = new NotificationWorker(
      env.prisma,
      {
        publishToUser: jest
          .fn()
          .mockRejectedValue(new Error('controlled offline transport')),
      },
      env.config,
    );
    await offline.tick();
    expect(
      (
        await env.prisma.order.findUniqueOrThrow({
          where: { id: order.orderId },
        })
      ).status,
    ).toBe('PENDING');
    expect(
      await env.prisma.notification.count({
        where: { referenceId: order.orderId },
      }),
    ).toBe(3);
  });
  it('revoke A leaves valid B connected; revoked branch grants deny REST immediately and outbound protected delivery', async () => {
    const who = await env.account('multi-device', 'CUSTOMER');
    const sessionB = await env.prisma.authSession.create({
      data: {
        userId: who.user.id,
        refreshTokenHash: ulid(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const tokenB = new JwtService().sign(
      { sub: who.user.id, sid: sessionB.id },
      {
        secret: env.config.getOrThrow<string>('auth.jwt.accessSecret'),
        expiresIn: 60,
      },
    );
    const a = await connect(who.cookie),
      b = await connect(`accessToken=${tokenB}`);
    const gotA: unknown[] = [],
      gotB: unknown[] = [];
    a.socket.on('test.revocation', (data: unknown) => gotA.push(data));
    b.socket.on('test.revocation', (data: unknown) => gotB.push(data));
    await env.prisma.authSession.update({
      where: { id: who.session.id },
      data: { revokedAt: new Date() },
    });
    await env.app
      .get(RealtimePublisher)
      .publishToUser(
        who.user.id,
        { name: 'test.revocation', version: 1, data: { ok: true } },
        () => true,
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(gotA).toEqual([]);
    expect(gotB).toHaveLength(1);
    expect(b.socket.connected).toBe(true);
    await env.prisma.userBranch.update({
      where: { id: env.staffAssignment.id },
      data: { isActive: false, isPrimary: false },
    });
    await api()
      .get(path)
      .set('Cookie', env.staff.cookie)
      .set('X-Branch-Id', env.branches[0].id)
      .expect(403);
  });
});
