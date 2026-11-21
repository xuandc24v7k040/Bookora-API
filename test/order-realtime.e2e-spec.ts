import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { ulid } from 'ulid';
import { ConfigService } from '@nestjs/config';
import { AdminOrdersService } from '@/modules/admin-orders/admin-orders.service';
import { CustomerOrdersService } from '@/modules/customer-orders/customer-orders.service';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher';
import { NotificationWorker } from '@/modules/notifications/notification-worker.service';
import { signalOrderChange } from '@/modules/orders/order-change-signal';
import { createNotificationEnvironment } from './helpers/notification-environment';

describe('Order after-commit hints and due-now worker wake — real PostgreSQL/Socket.IO', () => {
  jest.setTimeout(180000);
  let env: Awaited<ReturnType<typeof createNotificationEnvironment>>;
  const sockets: Socket[] = [];
  type Hint = { version: number; orderId: string; branchId: string };
  const received = new Map<string, Hint[]>();
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  async function until(
    check: () => boolean | Promise<boolean>,
    timeout = 3000,
  ) {
    const deadline = Date.now() + timeout;
    while (!(await check())) {
      if (Date.now() >= deadline)
        throw new Error('Expected realtime/DB condition not reached');
      await delay(20);
    }
  }
  async function connect(name: string, cookie: string) {
    const events: Hint[] = [];
    received.set(name, events);
    const socket = io(`${env.url}/realtime`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Cookie: cookie, Origin: 'http://localhost:15173' },
      autoConnect: false,
    });
    socket.on('order.changed', (event: Hint) => events.push(event));
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Socket connect timeout')),
        3000,
      );
      socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      socket.connect();
    });
  }
  const hints = (name: string, id: string) =>
    received.get(name)!.filter((hint) => hint.orderId === id);
  const count = (id: string, kind?: string) =>
    env.prisma.notification.count({
      where: { referenceId: id, ...(kind ? { type: kind } : {}) },
    });
  beforeAll(async () => {
    env = await createNotificationEnvironment(0, true, (app) =>
      app.get(ConfigService).set('NOTIFICATIONS_POLL_MS', 5000),
    );
    for (const [name, who] of Object.entries({
      owner: env.customerA,
      other: env.customerB,
      admin: env.admin,
      cashier: env.cashier,
      delegated: env.staff,
      readonly: env.readonly,
      system: env.system,
    }))
      await connect(name, who.cookie);
  });
  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await env?.worker.onModuleDestroy();
    await env?.close();
  });
  async function transition(
    id: string,
    targetStatus: 'CONFIRMED' | 'PACKING' | 'SHIPPING' | 'COMPLETED',
  ) {
    return request(env.app.getHttpServer())
      .post(`/api/v1/admin/orders/${id}/transitions`)
      .set('Cookie', env.admin.cookie)
      .set('X-CSRF-Token', env.csrf)
      .set('X-Branch-Id', env.branches[0].id)
      .send({ targetStatus })
      .expect(201);
  }

  it('due-now COD wakes ahead of 5s polling; read-only viewers receive hints but no operational Bell', async () => {
    const started = performance.now(),
      order = await env.place();
    await until(() => count(order.orderId).then((n) => n === 3));
    expect(performance.now() - started).toBeLessThan(3000);
    for (const who of ['owner', 'admin', 'cashier', 'delegated', 'readonly'])
      await until(() => hints(who, order.orderId).length === 1);
    expect(hints('other', order.orderId)).toHaveLength(0);
    expect(hints('system', order.orderId)).toHaveLength(0);
    expect(hints('readonly', order.orderId)[0]).toEqual({
      version: 1,
      orderId: order.orderId,
      branchId: env.branches[0].id,
    });
    expect(
      await env.prisma.notification.count({
        where: { referenceId: order.orderId, userId: env.readonly.user.id },
      }),
    ).toBe(0);
    const otherBranch = await env.place('COD', env.branches[1].id);
    await until(() => hints('admin', otherBranch.orderId).length === 1);
    for (const who of ['cashier', 'delegated', 'readonly'])
      expect(hints(who, otherBranch.orderId)).toHaveLength(0);
  });

  it('rollback and invalid transition have no phantom hints; a successful commit emits only afterwards', async () => {
    const order = await env.place();
    await until(() => hints('owner', order.orderId).length === 1);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transaction = env.prisma.$transaction(async (tx) => {
      await signalOrderChange(tx, order.orderId);
      await held;
      throw new Error('controlled rollback');
    });
    const rejected = expect(transaction).rejects.toThrow('controlled rollback');
    await delay(120);
    expect(hints('owner', order.orderId)).toHaveLength(1);
    release();
    await rejected;
    await delay(120);
    expect(hints('owner', order.orderId)).toHaveLength(1);
    await request(env.app.getHttpServer())
      .post(`/api/v1/admin/orders/${order.orderId}/transitions`)
      .set('Cookie', env.admin.cookie)
      .set('X-CSRF-Token', env.csrf)
      .set('X-Branch-Id', env.branches[0].id)
      .send({ targetStatus: 'COMPLETED' })
      .expect(409);
    await delay(100);
    expect(hints('owner', order.orderId)).toHaveLength(1);
    await transition(order.orderId, 'CONFIRMED');
    await until(() => hints('owner', order.orderId).length === 2);
    expect(
      (
        await env.prisma.order.findUniqueOrThrow({
          where: { id: order.orderId },
        })
      ).status,
    ).toBe('CONFIRMED');
  });

  it('Order hints remain independent while NotificationWorker is stopped; restart poll recovers durable jobs', async () => {
    await env.worker.onModuleDestroy();
    const order = await env.place();
    await until(() => hints('owner', order.orderId).length === 1);
    await transition(order.orderId, 'CONFIRMED');
    await until(() => hints('owner', order.orderId).length === 2);
    expect(await count(order.orderId)).toBe(0);
    expect(
      await env.prisma.notificationDispatch.count({
        where: { referenceId: order.orderId, state: 'PENDING' },
      }),
    ).toBe(2);
    env.worker.onModuleInit();
    await until(() => count(order.orderId).then((n) => n === 3), 6500);
    await until(() => count(order.orderId).then((n) => n === 4), 6500);
    await env.worker.tick();
    expect(await count(order.orderId)).toBe(4);
  });

  it('receipt is an idempotent flag change, then completion; note-only has no status hint', async () => {
    const order = await env.place();
    await until(() => hints('owner', order.orderId).length === 1);
    for (const status of ['CONFIRMED', 'PACKING', 'SHIPPING'] as const) {
      const before = hints('owner', order.orderId).length;
      await transition(order.orderId, status);
      await until(() => hints('owner', order.orderId).length === before + 1);
    }
    const service = env.app.get(CustomerOrdersService),
      actor = await env.principal();
    await service.confirmReceived(actor, order.orderId);
    await until(() => hints('admin', order.orderId).length === 5);
    await service.confirmReceived(actor, order.orderId);
    await delay(100);
    expect(hints('admin', order.orderId)).toHaveLength(5);
    expect(
      (
        await env.prisma.order.findUniqueOrThrow({
          where: { id: order.orderId },
        })
      ).status,
    ).toBe('SHIPPING');
    const admin = await env.principal(env.admin);
    admin.permissions = admin.branchAssignments[0].permissions;
    await env.app.get(AdminOrdersService).updateInternalNote(
      admin,
      {
        scope: 'SELECTED',
        selectedBranchId: env.branches[0].id,
        allowedBranchIds: admin.allowedBranchIds,
      },
      order.orderId,
      { note: 'Ghi chú không đổi trạng thái' },
    );
    await delay(100);
    expect(hints('admin', order.orderId)).toHaveLength(5);
    await transition(order.orderId, 'COMPLETED');
    await until(() => hints('owner', order.orderId).length === 6);
  });

  it('publish failure cannot turn a committed HTTP mutation into 500 or roll back its durable intent', async () => {
    const order = await env.place();
    await until(() => hints('owner', order.orderId).length === 1);
    const publisher = env.app.get(RealtimePublisher),
      original = publisher.publishToUser.bind(publisher);
    const spy = jest
      .spyOn(publisher, 'publishToUser')
      .mockImplementation((id, event, allowed) =>
        event.name === 'order.changed'
          ? Promise.reject(new Error('controlled emit failure'))
          : original(id, event, allowed),
      );
    try {
      await transition(order.orderId, 'CONFIRMED');
      await until(() =>
        spy.mock.calls.some(([, event]) => event.name === 'order.changed'),
      );
      expect(
        (
          await env.prisma.order.findUniqueOrThrow({
            where: { id: order.orderId },
          })
        ).status,
      ).toBe('CONFIRMED');
      await until(() =>
        count(order.orderId, 'ORDER_CONFIRMED').then((n) => n === 1),
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('large promotional cursor batches coexist with Order wake, dueAt, SKIP LOCKED and dedupe', async () => {
    await env.prisma.user.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        email: `batch-${index}-${ulid()}@realtime.example.test`,
        fullName: 'Batch fixture',
        type: 'CUSTOMER' as const,
      })),
    });
    const coupons = env.app.get(CouponsService);
    const campaign = await coupons.save({
      code: `WAKE${ulid()}`,
      name: 'Batch future fixture',
      type: 'ORDER',
      visibility: 'PUBLIC',
      discountType: 'PERCENTAGE',
      discountValue: 5,
      startAt: new Date(Date.now() + 60000).toISOString(),
      endAt: new Date(Date.now() + 120000).toISOString(),
      isActive: true,
    });
    const order = await env.place();
    env.worker.wakeOrder(order.orderId);
    await until(() => count(order.orderId).then((n) => n === 3));
    expect(await count(campaign.id)).toBe(0);
    await env.prisma.coupon.update({
      where: { id: campaign.id },
      data: { startAt: new Date(Date.now() - 1000) },
    });
    await env.prisma.notificationDispatch.update({
      where: { eventKey: `COUPON_ACTIVE:${campaign.id}` },
      data: { dueAt: new Date(0) },
    });
    const other = new NotificationWorker(
      env.prisma,
      env.app.get(RealtimePublisher),
      env.config,
    );
    await Promise.all([env.worker.tick(), other.tick()]);
    const parallelOrder = await env.place();
    await until(() => count(parallelOrder.orderId).then((n) => n === 3));
    await until(async () => {
      await env.worker.tick();
      return (await count(campaign.id)) === 107;
    }, 6500);
    expect(await count(campaign.id)).toBe(107);
    expect(
      (
        await env.prisma.notificationDispatch.findUniqueOrThrow({
          where: { eventKey: `COUPON_ACTIVE:${campaign.id}` },
        })
      ).state,
    ).toBe('DONE');
  });

  it('permission/session revocation after connect fails closed for Order hints', async () => {
    const assignment = await env.prisma.userBranch.findFirstOrThrow({
      where: { userId: env.readonly.user.id },
    });
    await env.prisma.userBranch.update({
      where: { id: assignment.id },
      data: { isActive: false, isPrimary: false },
    });
    await env.prisma.authSession.update({
      where: { id: env.customerB.session.id },
      data: { revokedAt: new Date() },
    });
    const order = await env.place();
    await until(() => hints('owner', order.orderId).length === 1);
    expect(hints('readonly', order.orderId)).toHaveLength(0);
    expect(hints('other', order.orderId)).toHaveLength(0);
    await request(env.app.getHttpServer())
      .get(`/api/v1/admin/orders/${order.orderId}`)
      .set('Cookie', env.readonly.cookie)
      .set('X-Branch-Id', env.branches[0].id)
      .expect(403);
  });
});
