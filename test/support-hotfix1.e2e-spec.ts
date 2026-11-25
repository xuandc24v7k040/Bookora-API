import request from 'supertest';
import { ulid } from 'ulid';
import { io } from 'socket.io-client';
import { createNotificationEnvironment } from './helpers/notification-environment';
import type {
  SupportSendResultDto,
  SupportHistoryDto,
} from '@/modules/support/dto/support.dto';

describe('Support Hotfix 1 persisted same-ticket replies', () => {
  jest.setTimeout(180000);
  let env: Awaited<ReturnType<typeof createNotificationEnvironment>>;
  beforeAll(async () => {
    env = await createNotificationEnvironment();
  });
  afterAll(async () => {
    await env?.close();
  });
  const post = (
    cookie: string,
    path: string,
    body: object = {},
    branch = env.branches[0].id,
  ) =>
    request(env.app.getHttpServer())
      .post(`/api/v1/support/${path}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', env.csrf)
      .set('X-Branch-Id', branch)
      .send(body);
  async function create(
    cookie = env.customerA.cookie,
    branchId = env.branches[0].id,
  ) {
    const response = await post(cookie, 'tickets', {
      type: 'GENERAL',
      branchId,
      message: { clientMessageId: ulid(), text: 'Original quote fixture' },
    }).expect(201);
    return (response.body as { data: SupportSendResultDto }).data;
  }
  it('persists a server-authored quote, replays once, rejects payload changes, and includes quote in cursor history', async () => {
    const original = await create();
    const payload = {
      clientMessageId: ulid(),
      text: 'Reply fixture',
      replyToMessageId: original.message.id,
    };
    const first = await post(
      env.customerA.cookie,
      `tickets/${original.ticketId}/messages`,
      payload,
    ).expect(201);
    const sent = (first.body as { data: SupportSendResultDto }).data;
    expect(sent.message.replyTo).toMatchObject({
      id: original.message.id,
      text: 'Original quote fixture',
      attachmentCount: 0,
    });
    expect(sent.message.replyToMessageId).toBe(original.message.id);
    const replay = await post(
      env.customerA.cookie,
      `tickets/${original.ticketId}/messages`,
      payload,
    ).expect(201);
    expect((replay.body as { data: SupportSendResultDto }).data).toMatchObject({
      replayed: true,
      message: { id: sent.message.id },
    });
    await post(env.customerA.cookie, `tickets/${original.ticketId}/messages`, {
      ...payload,
      replyToMessageId: sent.message.id,
    }).expect(409);
    const history = await request(env.app.getHttpServer())
      .get(
        `/api/v1/support/tickets/${original.ticketId}/messages?afterSequence=${original.message.sequence}`,
      )
      .set('Cookie', env.customerA.cookie)
      .expect(200);
    expect((history.body as { data: SupportHistoryDto }).data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sent.message.id,
          replyToMessageId: original.message.id,
        }),
      ]),
    );
    expect(
      await env.prisma.supportMessage.count({
        where: {
          senderUserId: env.customerA.user.id,
          clientMessageId: payload.clientMessageId,
        },
      }),
    ).toBe(1);
  });
  it('rejects foreign/cross-branch/missing quote references and first-message quotes', async () => {
    const own = await create();
    const foreign = await create(env.customerB.cookie);
    const otherBranch = await create(env.customerA.cookie, env.branches[1].id);
    for (const replyToMessageId of [
      foreign.message.id,
      otherBranch.message.id,
      ulid(),
    ]) {
      await post(env.customerA.cookie, `tickets/${own.ticketId}/messages`, {
        clientMessageId: ulid(),
        text: 'Invalid',
        replyToMessageId,
      }).expect(400);
    }
    await post(env.customerA.cookie, 'tickets', {
      type: 'GENERAL',
      branchId: env.branches[0].id,
      message: {
        clientMessageId: ulid(),
        text: 'Invalid create',
        replyToMessageId: own.message.id,
      },
    }).expect(400);
    await post(env.customerB.cookie, `tickets/${own.ticketId}/messages`, {
      clientMessageId: ulid(),
      text: 'Foreign',
      replyToMessageId: own.message.id,
    }).expect(404);
    await expect(
      env.prisma.supportMessage.update({
        where: { id: own.message.id },
        data: { replyToMessageId: foreign.message.id },
      }),
    ).rejects.toThrow();
    expect(
      (
        await env.prisma.supportMessage.findUniqueOrThrow({
          where: { id: own.message.id },
        })
      ).replyToMessageId,
    ).toBeNull();
  });
  it('publishes the canonical safe quote to an authorized peer through the shared realtime gateway', async () => {
    const original = await create();
    const socket = io(`${env.url}/realtime`, {
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
      extraHeaders: {
        Cookie: env.admin.cookie,
        Origin: 'http://localhost:15173',
      },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Socket connection timeout')),
          5000,
        );
        socket.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once('connect_error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        socket.connect();
      });
      const clientMessageId = ulid();
      const received = new Promise<
        SupportSendResultDto['message'] & { version: number }
      >((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Reply event timeout')),
          5000,
        );
        socket.on(
          'chat.message.created',
          (event: SupportSendResultDto['message'] & { version: number }) => {
            if (event.clientMessageId === clientMessageId) {
              clearTimeout(timer);
              resolve(event);
            }
          },
        );
      });
      await post(
        env.customerA.cookie,
        `tickets/${original.ticketId}/messages`,
        {
          clientMessageId,
          text: 'Socket reply',
          replyToMessageId: original.message.id,
        },
      ).expect(201);
      const event = await received;
      expect(event.version).toBe(1);
      expect(event.replyTo).toMatchObject({
        id: original.message.id,
        text: 'Original quote fixture',
        attachmentCount: 0,
      });
      expect(Object.keys(event.replyTo!).sort()).toEqual([
        'attachmentCount',
        'id',
        'senderName',
        'text',
      ]);
    } finally {
      socket.disconnect();
    }
  });
  it('preserves assignee and resolved-ticket authorization for replies', async () => {
    const original = await create();
    const payload = () => ({
      clientMessageId: ulid(),
      text: 'Staff reply',
      replyToMessageId: original.message.id,
    });
    await post(
      env.admin.cookie,
      `tickets/${original.ticketId}/messages`,
      payload(),
    ).expect(403);
    await post(env.admin.cookie, `tickets/${original.ticketId}/claim`).expect(
      201,
    );
    await post(
      env.admin.cookie,
      `tickets/${original.ticketId}/messages`,
      payload(),
    ).expect(201);
    await post(env.admin.cookie, `tickets/${original.ticketId}/resolve`).expect(
      201,
    );
    await post(
      env.customerA.cookie,
      `tickets/${original.ticketId}/messages`,
      payload(),
    ).expect(409);
  });
  it('maps an existing customer avatar in ticket and message DTOs without adding private fields', async () => {
    await env.prisma.user.update({
      where: { id: env.customerA.user.id },
      data: { avatarUrl: 'https://example.test/avatar.webp' },
    });
    const sent = await create();
    expect(sent.message.senderAvatarUrl).toBe(
      'https://example.test/avatar.webp',
    );
    const response = await request(env.app.getHttpServer())
      .get(`/api/v1/support/tickets/${sent.ticketId}`)
      .set('Cookie', env.admin.cookie)
      .set('X-Branch-Id', env.branches[0].id)
      .expect(200);
    expect(
      (response.body as { data: { customerAvatarUrl: string } }).data
        .customerAvatarUrl,
    ).toBe('https://example.test/avatar.webp');
  });
});
