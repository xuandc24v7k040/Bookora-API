import { ConfigService } from '@nestjs/config';
import { io, type Socket } from 'socket.io-client';
import { ulid } from 'ulid';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { CouponStatus } from '@/modules/coupons/coupons.dto';
import { FlashSalesService } from '@/modules/flash-sales/flash-sales.service';
import { schedulePromotion } from '@/modules/notifications/notification-intents';
import { NotificationWorker } from '@/modules/notifications/notification-worker.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher';
import { createNotificationEnvironment } from './helpers/notification-environment';

describe('Promotion deadline wake + Admin canonical time metadata (real PostgreSQL/Socket.IO)', () => {
  jest.setTimeout(180000);
  let env: Awaited<ReturnType<typeof createNotificationEnvironment>>;
  let socket: Socket;
  const received: Array<{ id?: string; type?: string }> = [];
  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  async function until(
    check: () => Promise<boolean> | boolean,
    timeout = 4000,
  ) {
    const end = performance.now() + timeout;
    while (!(await check())) {
      if (performance.now() > end)
        throw new Error('Timed out waiting for durable promotion result');
      await wait(25);
    }
  }
  beforeAll(async () => {
    env = await createNotificationEnvironment(0, true, (app) =>
      app.get(ConfigService).set('NOTIFICATIONS_POLL_MS', 5000),
    );
    socket = io(`${env.url}/realtime`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: {
        Cookie: env.customerA.cookie,
        Origin: 'http://localhost:15173',
      },
      autoConnect: false,
    });
    socket.on('notification.changed', (event) =>
      received.push(event as { id?: string; type?: string }),
    );
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
  });
  afterAll(async () => {
    socket?.disconnect();
    await env?.close();
  });
  function coupon(
    overrides: Partial<Parameters<CouponsService['save']>[0]> = {},
  ) {
    return env.app.get(CouponsService).save({
      code: `SYNC${ulid()}`,
      name: `Sync ${ulid()}`,
      type: 'ORDER',
      visibility: 'PUBLIC',
      discountType: 'PERCENTAGE',
      discountValue: 5,
      startAt: new Date(Date.now() + 1000).toISOString(),
      endAt: new Date(Date.now() + 60000).toISOString(),
      isActive: true,
      ...overrides,
    });
  }
  const count = (referenceId: string) =>
    env.prisma.notification.count({ where: { referenceId } });

  it('does not send early; wakes near the deadline with 5000ms fallback and a real socket event', async () => {
    const row = await coupon();
    await wait(200);
    expect(await count(row.id)).toBe(0);
    await until(async () => (await count(row.id)) === 2);
    const notification = await env.prisma.notification.findFirstOrThrow({
      where: { referenceId: row.id, userId: env.customerA.user.id },
    });
    expect(notification.createdAt.getTime()).toBeGreaterThanOrEqual(
      Date.parse(row.startAt),
    );
    await until(() => received.some((event) => event.id === notification.id));
    expect(Date.now() - Date.parse(row.startAt)).toBeLessThan(2000);
    await env.worker.tick();
    expect(await count(row.id)).toBe(2);
  });

  it('rearms an earlier/later edited deadline and rechecks disabled/private authority', async () => {
    const row = await coupon({
      startAt: new Date(Date.now() + 30000).toISOString(),
    });
    const service = env.app.get(CouponsService);
    const {
      code,
      name,
      type,
      visibility,
      discountType,
      discountValue,
      endAt,
      isActive,
    } = row;
    const data = {
      code,
      name,
      type,
      visibility,
      discountType,
      discountValue,
      endAt,
      isActive,
      startAt: new Date(Date.now() + 700).toISOString(),
    };
    await service.save(data, row.id);
    await service.save(
      { ...data, startAt: new Date(Date.now() + 1800).toISOString() },
      row.id,
    );
    await wait(1000);
    expect(await count(row.id)).toBe(0);
    await service.setActive(row.id, false);
    await until(
      async () =>
        (
          await env.prisma.notificationDispatch.findUniqueOrThrow({
            where: { eventKey: `COUPON_ACTIVE:${row.id}` },
          })
        ).state === 'SKIPPED',
    );
    expect(await count(row.id)).toBe(0);
    const privateRow = await coupon({ visibility: 'PRIVATE' });
    await wait(1300);
    expect(await count(privateRow.id)).toBe(0);
  });

  it('provides a future boundary outside an empty ACTIVE filter/page; derives start/end status canonically', async () => {
    const name = `Hidden ${ulid()}`;
    const row = await coupon({
      name,
      visibility: 'PRIVATE',
      startAt: new Date(Date.now() + 800).toISOString(),
      endAt: new Date(Date.now() + 1800).toISOString(),
    });
    const service = env.app.get(CouponsService);
    const before = await service.list({
      search: name,
      status: CouponStatus.ACTIVE,
      page: 9,
      limit: 1,
    });
    expect(before.items).toHaveLength(0);
    expect(before.nextTransitionAt).toBe(row.startAt);
    expect(Date.parse(before.nextTransitionAt)).toBeGreaterThan(
      Date.parse(before.serverNow),
    );
    await wait(900);
    const active = await service.list({
      search: name,
      status: CouponStatus.ACTIVE,
    });
    expect(active.items[0]?.status).toBe('ACTIVE');
    expect(active.totalItems).toBe(1);
    expect(active.nextTransitionAt).toBe(row.endAt);
    await wait(1000);
    const ended = await service.list({
      search: name,
      status: CouponStatus.ACTIVE,
    });
    expect(ended.totalItems).toBe(0);
    expect(ended.nextTransitionAt).toBeNull();
    expect((await service.detail(row.id)).status).toBe('EXPIRED');
    expect(await count(row.id)).toBe(0);
  });

  it('does not emit rolled-back intents; recovers pending deadlines after restart', async () => {
    const row = await coupon({
      startAt: new Date(Date.now() + 1000).toISOString(),
    });
    await env.worker.onModuleDestroy();
    await expect(
      env.prisma.$transaction(async (tx) => {
        await schedulePromotion(tx, 'COUPON_ACTIVE', row.id, new Date(), true);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      (
        await env.prisma.notificationDispatch.findUniqueOrThrow({
          where: { eventKey: `COUPON_ACTIVE:${row.id}` },
        })
      ).dueAt.toISOString(),
    ).toBe(row.startAt);
    await wait(1100);
    expect(await count(row.id)).toBe(0);
    env.worker.onModuleInit();
    await until(async () => (await count(row.id)) === 2);
  });

  it('drains multiple 100-recipient batches without a poll between batches and retains DB dedupe across workers', async () => {
    await env.prisma.user.createMany({
      data: Array.from({ length: 201 }, (_, index) => ({
        email: `batch-${ulid()}-${index}@example.test`,
        fullName: 'Batch fixture',
        type: 'CUSTOMER' as const,
      })),
    });
    const row = await coupon({
      startAt: new Date(Date.now() + 500).toISOString(),
    });
    const other = new NotificationWorker(
      env.prisma,
      env.app.get(RealtimePublisher),
      env.config,
    );
    other.onModuleInit();
    try {
      await until(async () => (await count(row.id)) === 203);
      expect(Date.now() - Date.parse(row.startAt)).toBeLessThan(3000);
      expect(
        await env.prisma.notification.count({
          where: { referenceId: row.id, user: { type: { not: 'CUSTOMER' } } },
        }),
      ).toBe(0);
    } finally {
      await other.onModuleDestroy();
    }
  });

  it('Flash Sale hidden scheduled rows enter ACTIVE then leave at end without DB enum transitions', async () => {
    const service = env.app.get(FlashSalesService),
      name = `Hidden flash ${ulid()}`;
    const row = await service.save(
      {
        name,
        startAt: new Date(Date.now() + 1500).toISOString(),
        endAt: new Date(Date.now() + 3000).toISOString(),
        items: [
          {
            variantId: env.variant.id,
            flashPrice: 80000,
            totalQuota: 20,
            maxQuantityPerUser: 2,
          },
        ],
      },
      env.system.user.id,
    );
    await service.control(row.id, { action: 'publish' }, env.system.user.id);
    const before = await service.list({
      search: name,
      status: 'ACTIVE',
      page: 9,
      limit: 1,
    });
    expect(before.items).toHaveLength(0);
    expect(before.nextTransitionAt).toBe(row.startAt);
    await until(
      async () =>
        (await service.list({ search: name, status: 'ACTIVE' })).totalItems ===
        1,
    );
    await until(async () => (await count(row.id)) === 203);
    await until(
      async () =>
        (await service.list({ search: name, status: 'ACTIVE' })).totalItems ===
        0,
    );
    expect((await service.detail(row.id)).status).toBe('ENDED');
    expect(
      (await env.prisma.flashSale.findUniqueOrThrow({ where: { id: row.id } }))
        .state,
    ).toBe('PUBLISHED');
    expect((await service.list({ search: name })).nextTransitionAt).toBeNull();
  });

  it('keeps due-now Orders responsive alongside pending multi-batch promotions', async () => {
    const campaign = await coupon({
      startAt: new Date(Date.now() + 500).toISOString(),
    });
    await wait(400);
    const started = performance.now();
    const order = await env.place();
    await until(
      async () =>
        (await env.prisma.notification.count({
          where: { referenceId: order.orderId, type: 'ORDER_NEW_COD' },
        })) === 3 && (await count(campaign.id)) === 203,
    );
    expect(performance.now() - started).toBeLessThan(3000);
  });
});
