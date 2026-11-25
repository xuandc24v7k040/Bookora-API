import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { ulid } from 'ulid';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SupportRealtimeService } from '@/modules/support/support-realtime.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher';
import { createNotificationEnvironment } from './helpers/notification-environment';
import {
  createDisposablePostgresDatabase,
  readMigrationSql,
} from './helpers/postgres-test-database';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type SendResult = {
  ticketId: string;
  replayed: boolean;
  message: {
    id: string;
    sequence: number;
    text: string;
    clientMessageId: string;
  };
};
type MessageEvent = {
  ticketId: string;
  messageId: string;
  sequence: number;
  clientMessageId: string;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Support additive migration preserves existing commerce records', () => {
  jest.setTimeout(180000);
  it('keeps Customer/Branch/Order/Notification rows byte-equivalent and adds only scoped Support grants', async () => {
    const database = await createDisposablePostgresDatabase(
      'support_preservation',
    );
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: database.databaseUrl }),
    });
    try {
      const name = '20261124090000_support_chat_foundation';
      for (const migration of readdirSync(
        join(process.cwd(), 'prisma/migrations'),
      )
        .filter((n) => /^\d/.test(n) && n < name)
        .sort())
        await database.runSql(readMigrationSql(migration));
      const customer = await prisma.user.create({
        data: {
          email: 'preserve@support.example.test',
          type: 'CUSTOMER',
          fullName: 'Fixture preservation',
        },
      });
      const branch = await prisma.branch.create({
        data: {
          name: 'Preservation branch',
          code: ulid(),
          address: 'Fixture only',
        },
      });
      const order = await prisma.order.create({
        data: {
          orderCode: ulid(),
          userId: customer.id,
          branchId: branch.id,
          idempotencyKey: ulid(),
          subtotalAmount: 100000,
          shippingFee: 0,
          totalAmount: 100000,
          deliveryAddressSource: 'CURRENT_LOCATION',
          receiverName: 'Fixture',
          receiverPhone: '0900000000',
          shippingAddress: 'Fixture address',
          shippingAddressLine: 'Fixture',
          shippingProvinceName: 'Fixture',
          shippingWardName: 'Fixture',
          branchNameSnapshot: branch.name,
          branchAddressSnapshot: branch.address,
          shippingFeeBreakdownSnapshot: {},
          shippingQuoteReference: ulid(),
        },
      });
      const dispatch = await prisma.notificationDispatch.create({
        data: {
          eventKey: ulid(),
          kind: 'ORDER_PLACED',
          referenceId: order.id,
          dueAt: new Date(),
          state: 'DONE',
        },
      });
      await prisma.notification.create({
        data: {
          userId: customer.id,
          branchId: branch.id,
          dispatchId: dispatch.id,
          type: 'ORDER_PLACED',
          category: 'ORDER',
          title: 'Preserve fixture',
          content: 'Existing notification',
          referenceType: 'ORDER',
          referenceId: order.id,
        },
      });
      await prisma.role.upsert({
        where: { code: 'BRANCH_ADMIN' },
        create: {
          code: 'BRANCH_ADMIN',
          name: 'Branch Admin',
          type: 'BRANCH',
          level: 70,
        },
        update: {},
      });
      const snapshot = async () =>
        database.query<{ snapshot: unknown }>(`SELECT jsonb_build_object(
        'users', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM users t),
        'branches', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM branches t),
        'orders', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM orders t),
        'notifications', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM notifications t)
      ) AS snapshot`);
      const before = await snapshot();
      await database.runSql(readMigrationSql(name));
      for (const migration of readdirSync(
        join(process.cwd(), 'prisma/migrations'),
      )
        .filter((n) => /^\d/.test(n) && n > name)
        .sort())
        await database.runSql(readMigrationSql(migration));
      expect(await snapshot()).toEqual(before);
      expect(
        await prisma.rolePermission.count({
          where: {
            role: { code: 'BRANCH_ADMIN' },
            permission: { code: { startsWith: 'support.' } },
          },
        }),
      ).toBe(4);
      expect(
        await prisma.rolePermission.count({
          where: {
            role: { code: { in: ['STAFF', 'CASHIER'] } },
            permission: { code: { startsWith: 'support.' } },
          },
        }),
      ).toBe(0);
      const directory = join(tmpdir(), 'bookora-support-evidence');
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, 'migration-preservation.json'),
        JSON.stringify(
          {
            migration: name,
            users: 1,
            branches: 1,
            orders: 1,
            notifications: 1,
            rowEquality: true,
            branchAdminSupportGrants: 4,
            staffCashierSupportGrants: 0,
          },
          null,
          2,
        ),
      );
    } finally {
      await prisma.$disconnect();
      await database.close();
    }
  });
});

describe('Support — real PostgreSQL, HTTP, cookie Auth and Socket.IO', () => {
  jest.setTimeout(180000);
  let env: Awaited<ReturnType<typeof createNotificationEnvironment>>;
  let customerCookie: string, adminCookie: string;
  const sockets: Socket[] = [];
  const events = new Map<string, MessageEvent[]>();
  let ticketId: string;
  let orderId: string;
  let orderTicketId: string;
  let staffCookie: string;

  const cookie = (who: string) =>
    who === 'customer'
      ? customerCookie
      : who === 'admin'
        ? adminCookie
        : who === 'staff'
          ? staffCookie
          : who === 'other'
            ? env.customerB.cookie
            : who === 'system'
              ? env.system.cookie
              : env.cashier.cookie;
  function http(
    who: string,
    method: 'post' | 'get',
    path: string,
    body?: object,
    branchId = env.branches[0].id,
  ) {
    const req = request(env.app.getHttpServer())
      [method](`/api/v1/support/${path}`)
      .set('Cookie', cookie(who))
      .set('X-CSRF-Token', env.csrf)
      .set('X-Branch-Id', branchId);
    return body ? req.send(body) : req;
  }
  async function login(email: string) {
    const res = await request(env.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', `csrfToken=${env.csrf}`)
      .set('X-CSRF-Token', env.csrf)
      .send({ email, password: env.password })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    return [
      ...cookies.map((c) => c.split(';')[0]),
      `csrfToken=${env.csrf}`,
    ].join('; ');
  }
  async function connect(name: string, authCookie: string) {
    const received: MessageEvent[] = [];
    events.set(name, received);
    const socket = io(`${env.url}/realtime`, {
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
      extraHeaders: { Cookie: authCookie, Origin: 'http://localhost:15173' },
    });
    sockets.push(socket);
    socket.on('chat.message.created', (event: MessageEvent) =>
      received.push(event),
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Socket connect timeout')),
        5000,
      );
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      socket.connect();
    });
    return socket;
  }
  async function grant(id: string, codes: string[]) {
    const assignment = await env.prisma.userBranch.findFirstOrThrow({
      where: { userId: id, branchId: env.branches[0].id },
    });
    for (const code of codes) {
      const permission = await env.prisma.permission.findUniqueOrThrow({
        where: { code },
      });
      await env.prisma.userBranchPermission.upsert({
        where: {
          userBranchId_permissionId: {
            userBranchId: assignment.id,
            permissionId: permission.id,
          },
        },
        create: {
          userBranchId: assignment.id,
          permissionId: permission.id,
          effect: 'ALLOW',
        },
        update: { effect: 'ALLOW' },
      });
    }
  }
  const create = (
    text = 'Cần hỗ trợ',
    key = ulid(),
    branchId = env.branches[0].id,
  ) =>
    http('customer', 'post', 'tickets', {
      type: 'GENERAL',
      branchId,
      message: { clientMessageId: key, text },
    });
  const send = (who: string, text: string, key = ulid(), id = ticketId) =>
    http(who, 'post', `tickets/${id}/messages`, { clientMessageId: key, text });

  beforeAll(async () => {
    env = await createNotificationEnvironment();
    customerCookie = await login(env.customerA.user.email);
    adminCookie = await login(env.admin.user.email);
    staffCookie = await login(env.staff.user.email);
    await grant(env.staff.user.id, [
      'support.read',
      'support.claim',
      'support.reply',
    ]);
    await connect('customer', customerCookie);
    await connect('admin', adminCookie);
    await connect('other', env.customerB.cookie);
    await connect('cashier', env.cashier.cookie);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await env?.app.get(SupportRealtimeService).settled();
    await env?.close();
  });

  it('creates first message atomically; empty/foreign order has no ticket side effect', async () => {
    await http('customer', 'post', 'tickets', {
      type: 'GENERAL',
      branchId: env.branches[0].id,
    }).expect(400);
    await create('').expect(400);
    expect(await env.prisma.supportTicket.count()).toBe(0);
    const result = await create().expect(201);
    ticketId = (result.body.data as SendResult).ticketId;
    const ticket = await env.prisma.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    expect(ticket).toMatchObject({
      customerId: env.customerA.user.id,
      branchId: env.branches[0].id,
      status: 'OPEN',
      assigneeId: null,
      lastSequence: 1,
    });
    orderId = (await env.place('COD', env.branches[1].id)).orderId;
    const orderResult = await http('customer', 'post', 'tickets', {
      type: 'ORDER',
      orderId,
      branchId: env.branches[0].id,
      message: { clientMessageId: ulid(), text: 'Đơn của tôi' },
    }).expect(201);
    orderTicketId = (orderResult.body.data as SendResult).ticketId;
    expect(
      await env.prisma.supportTicket.findUnique({
        where: { id: orderTicketId },
      }),
    ).toMatchObject({ branchId: env.branches[1].id, orderId });
    await http('other', 'post', 'tickets', {
      type: 'ORDER',
      orderId,
      message: { clientMessageId: ulid(), text: 'Đoán ID' },
    }).expect(404);
  });

  it('concurrent GENERAL and ORDER sends preserve every message with one active ticket', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, n) => create(`Đồng thời ${n}`).expect(201)),
    );
    expect(
      new Set(results.map((r) => (r.body.data as SendResult).ticketId)),
    ).toEqual(new Set([ticketId]));
    expect(await env.prisma.supportMessage.count({ where: { ticketId } })).toBe(
      9,
    );
    const orderResults = await Promise.all(
      Array.from({ length: 6 }, (_, n) =>
        http('customer', 'post', 'tickets', {
          type: 'ORDER',
          orderId,
          message: { clientMessageId: ulid(), text: `Đơn đồng thời ${n}` },
        }).expect(201),
      ),
    );
    expect(
      new Set(orderResults.map((r) => (r.body.data as SendResult).ticketId)),
    ).toEqual(new Set([orderTicketId]));
    const key = ulid();
    const [a, b] = await Promise.all([
      create('Retry', key).expect(201),
      create('Retry', key).expect(201),
    ]);
    expect((a.body.data as SendResult).message.id).toBe(
      (b.body.data as SendResult).message.id,
    );
    await create('Đã đổi nội dung', key).expect(409);
  });

  it('isolates owner, branch, orders-only staff and SYSTEM; requires CSRF', async () => {
    await http('other', 'get', `tickets/${ticketId}`).expect(404);
    await http('cashier', 'get', 'tickets').expect(403);
    await http('system', 'get', 'tickets').expect(403);
    await http('staff', 'get', `tickets/${orderTicketId}`).expect(404);
    await http(
      'admin',
      'get',
      `tickets/${ticketId}`,
      undefined,
      env.branches[1].id,
    ).expect(404);
    await request(env.app.getHttpServer())
      .post(`/api/v1/support/tickets/${ticketId}/claim`)
      .set('Cookie', adminCookie)
      .expect(403);
    await request(env.app.getHttpServer())
      .get('/api/v1/support/tickets')
      .expect(401);
  });

  it('atomic claim has exactly one winner; only assignee replies and manager takes over explicitly', async () => {
    const results = await Promise.all(
      ['admin', 'staff'].map((who) =>
        http(who, 'post', `tickets/${ticketId}/claim`).then((r) => r.status),
      ),
    );
    expect(results.sort()).toEqual([201, 409]);
    const ticket = await env.prisma.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    const unassigned =
      ticket.assigneeId === env.admin.user.id ? 'staff' : 'admin';
    await send(unassigned, 'Không được chen vào').expect(403);
    await http('admin', 'post', `tickets/${ticketId}/reassign`, {
      assigneeId: env.admin.user.id,
    }).expect(201);
    await send('staff', 'Đã bị chuyển phụ trách').expect(403);
    await send('admin', 'Đã tiếp nhận').expect(201);
  });

  it('message retries conflict safely, history order is stable, and unread/seen are per-user', async () => {
    const key = ulid();
    const [a, b] = await Promise.all([
      send('customer', 'Xin hỗ trợ', key).expect(201),
      send('customer', 'Xin hỗ trợ', key).expect(201),
    ]);
    expect((a.body.data as SendResult).message.id).toBe(
      (b.body.data as SendResult).message.id,
    );
    await send('customer', 'Khác', key).expect(409);
    await Promise.all(
      Array.from({ length: 10 }, (_, n) =>
        send('customer', `Tin ${n}`).expect(201),
      ),
    );
    const messages = await env.prisma.supportMessage.findMany({
      where: { ticketId },
      orderBy: { sequence: 'asc' },
    });
    expect(messages.map((m) => m.sequence)).toEqual(
      Array.from({ length: messages.length }, (_, n) => n + 1),
    );
    const seq = messages.length;
    await Promise.all([
      http('admin', 'post', `tickets/${ticketId}/read`, {
        lastReadSequence: seq,
      }).expect(201),
      http('admin', 'post', `tickets/${ticketId}/read`, {
        lastReadSequence: 2,
      }).expect(201),
    ]);
    const admin = await http('admin', 'get', `tickets/${ticketId}`).expect(200);
    const staff = await http('staff', 'get', `tickets/${ticketId}`).expect(200);
    expect(admin.body.data.unreadCount).toBe(0);
    expect(staff.body.data.unreadCount).toBeGreaterThan(0);
    expect(admin.body.data.assigneeReadSequence).toBe(seq);
    await http('admin', 'post', `tickets/${ticketId}/read`, {
      lastReadSequence: seq + 100,
    }).expect(400);
    const first = await http(
      'customer',
      'get',
      `tickets/${ticketId}/messages?limit=5`,
    ).expect(200);
    expect(first.body.data.items).toHaveLength(5);
    expect(first.body.data.nextSequence).toBe(seq - 4);
    const delta = await http(
      'customer',
      'get',
      `tickets/${ticketId}/messages?afterSequence=${seq - 2}`,
    ).expect(200);
    expect(
      delta.body.data.items.map((m: { sequence: number }) => m.sequence),
    ).toEqual([seq - 1, seq]);
    await http('customer', 'get', 'tickets?cursor=invalid').expect(400);
  });

  it('resolved sends fail; explicit reopen clears assignee and reuses a newer active ticket', async () => {
    await http('admin', 'post', `tickets/${ticketId}/resolve`).expect(201);
    await send('customer', 'Không tự mở lại').expect(409);
    await http('customer', 'post', `tickets/${ticketId}/reopen`).expect(201);
    expect(
      await env.prisma.supportTicket.findUnique({ where: { id: ticketId } }),
    ).toMatchObject({ status: 'OPEN', assigneeId: null });
    await http('admin', 'post', `tickets/${ticketId}/claim`).expect(201);
    await http('admin', 'post', `tickets/${ticketId}/resolve`).expect(201);
    const fresh = await create('Yêu cầu mới').expect(201);
    const reopened = await http(
      'customer',
      'post',
      `tickets/${ticketId}/reopen`,
    ).expect(201);
    expect(reopened.body.data.id).toBe(
      (fresh.body.data as SendResult).ticketId,
    );
    ticketId = reopened.body.data.id as string;
    await http('admin', 'post', `tickets/${ticketId}/claim`).expect(201);
  });

  it('post-commit events reach only authorized sockets; publisher failure preserves canonical HTTP success', async () => {
    const sent = await send('customer', 'Realtime đúng người').expect(201);
    const id = (sent.body.data as SendResult).message.id;
    await env.app.get(SupportRealtimeService).settled();
    expect(events.get('admin')!.some((e) => e.messageId === id)).toBe(true);
    expect(events.get('other')!.some((e) => e.messageId === id)).toBe(false);
    expect(events.get('cashier')!.some((e) => e.messageId === id)).toBe(false);
    const publisher = env.app.get(RealtimePublisher);
    const original = publisher.publishToUser.bind(publisher);
    const spy = jest
      .spyOn(publisher, 'publishToUser')
      .mockImplementation((id, event, entitled) =>
        event.name.startsWith('chat.')
          ? Promise.reject(new Error('controlled emit failure'))
          : original(id, event, entitled),
      );
    try {
      const result = await send('customer', 'Commit vẫn thành công').expect(
        201,
      );
      await env.app.get(SupportRealtimeService).settled();
      expect(
        await env.prisma.supportMessage.findUnique({
          where: { id: (result.body.data as SendResult).message.id },
        }),
      ).not.toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('measures >=40 authenticated HTTP-to-recipient websocket sends on one monotonic clock', async () => {
    const samples: number[] = [];
    for (let n = 0; n < 44; n++) {
      const from = n % 2 ? 'admin' : 'customer';
      const receiver = sockets[from === 'admin' ? 0 : 1];
      const key = ulid();
      let receivedAt = 0;
      const eventPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          receiver.off('chat.message.created', handler);
          reject(new Error('Message not delivered'));
        }, 5000);
        const handler = (event: MessageEvent) => {
          if (event.clientMessageId === key) {
            receivedAt = performance.now();
            clearTimeout(timer);
            receiver.off('chat.message.created', handler);
            resolve();
          }
        };
        receiver.on('chat.message.created', handler);
      });
      const start = performance.now();
      await send(from, `Đo độ trễ ${n}`, key).expect(201);
      await eventPromise;
      if (n >= 4) samples.push(receivedAt - start);
    }
    await env.app.get(SupportRealtimeService).settled();
    const stats = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        n: sorted.length,
        min: sorted[0],
        P50: sorted[Math.ceil(sorted.length * 0.5) - 1],
        P95: sorted[Math.ceil(sorted.length * 0.95) - 1],
        max: sorted.at(-1),
      };
    };
    const timings = env.app
      .get(SupportRealtimeService)
      .timingSnapshot()
      .slice(-40);
    const evidence = {
      transport: 'websocket',
      auth: 'POST auth/login -> HttpOnly cookie -> real gateway',
      httpToSocket: stats(samples),
      commitToPublish: stats(timings.map((t) => t.commitToPublishMs)),
      commitToEmitComplete: stats(timings.map((t) => t.commitToEmitCompleteMs)),
    };
    const dir = join(tmpdir(), 'bookora-support-evidence');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'latency.json'), JSON.stringify(evidence, null, 2));
    console.log('SUPPORT_LATENCY', JSON.stringify(evidence));
    expect(evidence.httpToSocket.n).toBe(40);
    expect(evidence.httpToSocket.P95).toBeLessThanOrEqual(1000);
    expect(evidence.commitToPublish.P95).toBeLessThanOrEqual(150);
  });

  it('typing is whitelisted, authorized, ephemeral and clears on TTL/disconnect', async () => {
    const customer = sockets[0],
      admin = sockets[1];
    const received: string[] = [];
    admin.on('chat.typing.start', () => received.push('start'));
    admin.on('chat.typing.stop', () => received.push('stop'));
    const count = await env.prisma.supportMessage.count();
    const ack = await new Promise<{ ok: boolean }>((resolve) =>
      customer.emit('chat.typing.start', { ticketId }, resolve),
    );
    expect(ack.ok).toBe(true);
    expect(received).toContain('start');
    const rate = await new Promise<{ ok: boolean; code: string }>((resolve) =>
      customer.emit('chat.typing.start', { ticketId }, resolve),
    );
    expect(rate).toMatchObject({ ok: false, code: 'SUPPORT_RATE_LIMITED' });
    await sleep(3200);
    expect(received).toContain('stop');
    expect(await env.prisma.supportMessage.count()).toBe(count);
    const foreign = await new Promise<{ ok: boolean }>((resolve) =>
      sockets[2].emit('chat.typing.start', { ticketId }, resolve),
    );
    expect(foreign.ok).toBe(false);
    const spoof = await new Promise<{ ok: boolean }>((resolve) =>
      customer.emit(
        'chat.typing.start',
        { ticketId, userId: env.admin.user.id },
        resolve,
      ),
    );
    expect(spoof.ok).toBe(false);
    const timings: number[] = [];
    await sleep(250);
    for (let n = 0; n < 12; n++) {
      const from = n % 2 ? admin : customer;
      const to = n % 2 ? customer : admin;
      let timeout!: ReturnType<typeof setTimeout>;
      const frame = new Promise<number>((resolve, reject) => {
        const listener = () => {
          clearTimeout(timeout);
          resolve(performance.now());
        };
        timeout = setTimeout(() => {
          to.off('chat.typing.start', listener);
          reject(new Error('Typing signal missing'));
        }, 2000);
        to.once('chat.typing.start', listener);
      });
      const start = performance.now();
      from.emit('chat.typing.start', { ticketId });
      timings.push((await frame) - start);
      await sleep(250);
    }
    const sorted = timings.sort((a, b) => a - b);
    const evidence = {
      n: sorted.length,
      min: sorted[0],
      P50: sorted[5],
      P95: sorted[11],
      max: sorted[11],
      method:
        'One Node monotonic clock, actual authenticated Socket.IO sender emit -> recipient callback, 6 trials per direction',
    };
    writeFileSync(
      join(tmpdir(), 'bookora-support-evidence', 'typing.json'),
      JSON.stringify(evidence, null, 2),
    );
    expect(evidence.P95).toBeLessThanOrEqual(400);
  });

  it('DB directly enforces active uniqueness, nonempty creation, order binding and monotonic reads', async () => {
    await expect(
      env.prisma.supportTicket.create({
        data: {
          customerId: env.customerA.user.id,
          branchId: env.branches[0].id,
          type: 'GENERAL',
        },
      }),
    ).rejects.toThrow();
    await expect(
      env.prisma.supportTicket.create({
        data: {
          customerId: env.customerB.user.id,
          branchId: env.branches[0].id,
          type: 'GENERAL',
        },
      }),
    ).rejects.toThrow();
    await expect(
      env.prisma.supportTicket.create({
        data: {
          customerId: env.customerA.user.id,
          branchId: env.branches[0].id,
          orderId,
          type: 'ORDER',
        },
      }),
    ).rejects.toThrow();
    await http('admin', 'post', `tickets/${ticketId}/read`, {
      lastReadSequence: 2,
    }).expect(201);
    await expect(
      env.prisma.supportReadState.update({
        where: { ticketId_userId: { ticketId, userId: env.admin.user.id } },
        data: { lastReadSequence: 1 },
      }),
    ).rejects.toThrow();
  });

  it('races first creation from empty GENERAL and ORDER scopes without splitting or losing messages', async () => {
    const newOrder = await env.place('COD', env.branches[1].id, env.customerB);
    for (const context of [
      { type: 'GENERAL', branchId: env.branches[1].id },
      { type: 'ORDER', orderId: newOrder.orderId },
    ]) {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, n) =>
          http('other', 'post', 'tickets', {
            ...context,
            message: { clientMessageId: ulid(), text: `First-send race ${n}` },
          }).expect(201),
        ),
      );
      const ids = results.map((r) => (r.body.data as SendResult).ticketId);
      expect(new Set(ids).size).toBe(1);
      expect(
        await env.prisma.supportMessage.count({ where: { ticketId: ids[0] } }),
      ).toBe(8);
    }
  });

  it('enforces read-only Support and safe order context independently of orders.read; resets seen on reassignment', async () => {
    await grant(env.readonly.user.id, ['support.read']);
    await request(env.app.getHttpServer())
      .get(`/api/v1/support/tickets/${ticketId}`)
      .set('Cookie', env.readonly.cookie)
      .set('X-Branch-Id', env.branches[0].id)
      .expect(200);
    await request(env.app.getHttpServer())
      .post(`/api/v1/support/tickets/${ticketId}/claim`)
      .set('Cookie', env.readonly.cookie)
      .set('X-CSRF-Token', env.csrf)
      .set('X-Branch-Id', env.branches[0].id)
      .expect(403);
    const assignment = await env.prisma.userBranch.findFirstOrThrow({
      where: { userId: env.admin.user.id, branchId: env.branches[1].id },
    });
    const permission = await env.prisma.permission.findUniqueOrThrow({
      where: { code: 'orders.read' },
    });
    await env.prisma.userBranchPermission.create({
      data: {
        userBranchId: assignment.id,
        permissionId: permission.id,
        effect: 'DENY',
      },
    });
    const context = await http(
      'admin',
      'get',
      `tickets/${orderTicketId}/order-context`,
      undefined,
      env.branches[1].id,
    ).expect(200);
    expect(context.body.data.canViewOrderDetail).toBe(false);
    expect(JSON.stringify(context.body.data)).not.toMatch(
      /receiver|phone|shipping|payment|totalAmount/,
    );
    await request(env.app.getHttpServer())
      .get(`/api/v1/admin/orders/${orderId}`)
      .set('Cookie', adminCookie)
      .set('X-Branch-Id', env.branches[1].id)
      .expect(403);
    // Permission changes trigger transport revalidation; use a freshly authenticated admin socket for later load tests.
    sockets[1].disconnect();
    sockets[1] = await connect('admin', adminCookie);
    await http('staff', 'post', `tickets/${ticketId}/read`, {
      lastReadSequence: 10,
    }).expect(201);
    await http('admin', 'post', `tickets/${ticketId}/reassign`, {
      assigneeId: env.staff.user.id,
    }).expect(201);
    const detail = await http('customer', 'get', `tickets/${ticketId}`).expect(
      200,
    );
    expect(detail.body.data.assigneeReadSequence).toBe(0);
    await http('admin', 'post', `tickets/${ticketId}/reassign`, {
      assigneeId: env.admin.user.id,
    }).expect(201);
  });

  it('supports 100 simultaneous authenticated users with bounded fanout and no foreign delivery', async () => {
    const role = await env.prisma.role.findUniqueOrThrow({
      where: { code: 'BRANCH_ADMIN' },
    });
    for (let offset = 0; offset < 96; offset += 8)
      await Promise.all(
        Array.from({ length: 8 }, async (_, j) => {
          const n = offset + j;
          const who = await env.account(
            `support-load-${n}`,
            n < 32 ? 'BRANCH' : 'CUSTOMER',
          );
          if (n < 32)
            await env.prisma.userBranch.create({
              data: {
                userId: who.user.id,
                branchId: env.branches[0].id,
                roles: { create: { roleId: role.id } },
              },
            });
          await connect(`load-${n}`, who.cookie);
        }),
      );
    expect(
      new Set(sockets.filter((s) => s.connected).map((s) => s.id)).size,
    ).toBe(100);
    const samples: number[] = [];
    for (let n = 0; n < 8; n++) {
      const key = ulid();
      const target = sockets[1];
      const event = new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => {
          target.off('chat.message.created', listener);
          reject(new Error('Load event missing'));
        }, 5000);
        const listener = (e: MessageEvent) => {
          if (e.clientMessageId === key) {
            clearTimeout(timer);
            target.off('chat.message.created', listener);
            resolve(performance.now());
          }
        };
        target.on('chat.message.created', listener);
      });
      const started = performance.now();
      const response = await send('customer', `Load ${n}`, key).expect(201);
      samples.push((await event) - started);
      await env.app.get(SupportRealtimeService).settled();
      const id = (response.body.data as SendResult).message.id;
      for (let j = 0; j < 96; j++)
        expect(events.get(`load-${j}`)!.some((e) => e.messageId === id)).toBe(
          j < 32,
        );
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const evidence = {
      sockets: 100,
      uniqueUsers: 100,
      connectedBranchReaders: 33,
      n: samples.length,
      min: sorted[0],
      P50: sorted[3],
      P95: sorted[7],
      max: sorted[7],
    };
    writeFileSync(
      join(tmpdir(), 'bookora-support-evidence', 'load.json'),
      JSON.stringify(evidence, null, 2),
    );
    console.log('SUPPORT_LOAD', JSON.stringify(evidence));
    expect(evidence.P95).toBeLessThanOrEqual(1000);
  });

  it('preserves 4000 Unicode code points and emits only a reference when content exceeds the socket budget', async () => {
    const result = await send('customer', '📚'.repeat(4000)).expect(201);
    await send('customer', '📚'.repeat(4001)).expect(400);
    const id = (result.body.data as SendResult).message.id;
    await env.app.get(SupportRealtimeService).settled();
    const event = events.get('admin')!.find((e) => e.messageId === id);
    expect(event).toMatchObject({ contentOmitted: true });
    const history = await http(
      'admin',
      'get',
      `tickets/${ticketId}/messages?afterSequence=${(result.body.data as SendResult).message.sequence - 1}`,
    ).expect(200);
    expect(history.body.data.items[0].text).toBe('📚'.repeat(4000));
  });

  it('permission override revocation after handshake suppresses protected events immediately', async () => {
    const reader = await connect('readonly', env.readonly.cookie);
    const assignment = await env.prisma.userBranch.findFirstOrThrow({
      where: { userId: env.readonly.user.id, branchId: env.branches[0].id },
    });
    const permission = await env.prisma.permission.findUniqueOrThrow({
      where: { code: 'support.read' },
    });
    await env.prisma.userBranchPermission.upsert({
      where: {
        userBranchId_permissionId: {
          userBranchId: assignment.id,
          permissionId: permission.id,
        },
      },
      create: {
        userBranchId: assignment.id,
        permissionId: permission.id,
        effect: 'DENY',
      },
      update: { effect: 'DENY' },
    });
    const result = await send(
      'customer',
      'Không phát cho người đã mất quyền',
    ).expect(201);
    await env.app.get(SupportRealtimeService).settled();
    expect(
      events
        .get('readonly')!
        .some(
          (e) => e.messageId === (result.body.data as SendResult).message.id,
        ),
    ).toBe(false);
    expect(reader.connected).toBe(false);
  });

  it('revoking assignment/session while socket stays online fails closed at REST and delivery', async () => {
    await env.prisma.userBranch.update({
      where: { id: env.staffAssignment.id },
      data: { isActive: false, isPrimary: false },
    });
    await http('staff', 'get', `tickets/${ticketId}`).expect(404);
    const adminEvents = events.get('admin')!.length;
    await env.prisma.authSession.updateMany({
      where: { userId: env.admin.user.id },
      data: { revokedAt: new Date() },
    });
    await send('customer', 'Sau khi thu hồi phiên').expect(201);
    await env.app.get(SupportRealtimeService).settled();
    expect(events.get('admin')!.length).toBe(adminEvents);
    await http('admin', 'get', `tickets/${ticketId}`).expect(401);
  });
});
