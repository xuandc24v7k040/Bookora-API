import request from 'supertest';
import { ulid } from 'ulid';
import { createNotificationEnvironment } from './helpers/notification-environment';

describe('Phase 2 exact order history and scoped assignee lookup', () => {
  jest.setTimeout(180000);
  let env: Awaited<ReturnType<typeof createNotificationEnvironment>>;
  beforeAll(async () => {
    env = await createNotificationEnvironment();
  });
  afterAll(async () => {
    await env?.close();
  });
  const get = (cookie: string, path: string, branchId?: string) => {
    const req = request(env.app.getHttpServer())
      .get(`/api/v1/support/${path}`)
      .set('Cookie', cookie);
    return branchId ? req.set('X-Branch-Id', branchId) : req;
  };
  const post = (cookie: string, path: string, body: object = {}) =>
    request(env.app.getHttpServer())
      .post(`/api/v1/support/${path}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', env.csrf)
      .set('X-Branch-Id', env.branches[0].id)
      .send(body);
  async function override(
    userId: string,
    code: string,
    effect: 'ALLOW' | 'DENY',
  ) {
    const assignment = await env.prisma.userBranch.findFirstOrThrow({
      where: { userId, branchId: env.branches[0].id },
    });
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
        effect,
      },
      update: { effect },
    });
  }
  it('returns exactly the owned ORDER resolved history, excluding other orders and customers', async () => {
    const firstOrder = await env.place();
    const secondOrder = await env.place();
    const created = await post(env.customerA.cookie, 'tickets', {
      type: 'ORDER',
      orderId: firstOrder.orderId,
      message: { clientMessageId: ulid(), text: 'Order history fixture' },
    }).expect(201);
    const id = (created.body as { data: { ticketId: string } }).data.ticketId;
    await post(env.admin.cookie, `tickets/${id}/resolve`).expect(201);
    const response = await get(
      env.customerA.cookie,
      `tickets?orderId=${firstOrder.orderId}&status=RESOLVED&limit=1`,
    ).expect(200);
    expect(
      (
        response.body as { data: { items: Array<{ id: string }> } }
      ).data.items.map((t) => t.id),
    ).toEqual([id]);
    const none = await get(
      env.customerA.cookie,
      `tickets?orderId=${secondOrder.orderId}&status=RESOLVED`,
    ).expect(200);
    expect((none.body as { data: { items: unknown[] } }).data.items).toEqual(
      [],
    );
    const foreign = await get(
      env.customerB.cookie,
      `tickets?orderId=${firstOrder.orderId}`,
    ).expect(200);
    expect((foreign.body as { data: { items: unknown[] } }).data.items).toEqual(
      [],
    );
  });
  it('requires current-branch read/manage and never permits Customer/System/orders-only access', async () => {
    await get(env.customerA.cookie, 'assignees', env.branches[0].id).expect(
      403,
    );
    await get(env.system.cookie, 'assignees', env.branches[0].id).expect(403);
    await get(env.cashier.cookie, 'assignees', env.branches[0].id).expect(403);
    await get(env.admin.cookie, 'assignees').expect(403);
    await get(env.admin.cookie, 'assignees', ulid()).expect(403);
  });
  it('lists only effective read/reply staff and exposes only ID/name without HR permission', async () => {
    await override(env.readonly.user.id, 'support.read', 'ALLOW');
    await override(env.readonly.user.id, 'support.manage', 'ALLOW');
    await override(env.readonly.user.id, 'staff.read', 'DENY');
    await override(env.staff.user.id, 'support.read', 'ALLOW');
    await override(env.staff.user.id, 'support.reply', 'ALLOW');
    const response = await get(
      env.readonly.cookie,
      'assignees',
      env.branches[0].id,
    ).expect(200);
    const items = (
      response.body as { data: { items: Array<{ id: string; name: string }> } }
    ).data.items;
    expect(items.map((t) => t.id)).toContain(env.staff.user.id);
    expect(items.map((t) => t.id)).not.toContain(env.readonly.user.id);
    expect(items.map((t) => t.id)).not.toContain(env.cashier.user.id);
    for (const item of items)
      expect(Object.keys(item).sort()).toEqual(['id', 'name']);
  });
  it('immediately excludes denied/inactive assignees and rejects stale assignment choices', async () => {
    await override(env.staff.user.id, 'support.reply', 'DENY');
    const response = await get(
      env.admin.cookie,
      'assignees',
      env.branches[0].id,
    ).expect(200);
    expect(
      (
        response.body as { data: { items: Array<{ id: string }> } }
      ).data.items.map((t) => t.id),
    ).not.toContain(env.staff.user.id);
    const created = await post(env.customerA.cookie, 'tickets', {
      type: 'GENERAL',
      branchId: env.branches[0].id,
      message: { clientMessageId: ulid(), text: 'Assignment fixture' },
    }).expect(201);
    const id = (created.body as { data: { ticketId: string } }).data.ticketId;
    await post(env.admin.cookie, `tickets/${id}/reassign`, {
      assigneeId: env.staff.user.id,
    }).expect(400);
    await env.prisma.user.update({
      where: { id: env.admin.user.id },
      data: { isActive: false },
    });
    await get(env.readonly.cookie, 'assignees', env.branches[0].id)
      .expect(200)
      .then((r) => {
        expect(
          (r.body as { data: { items: Array<{ id: string }> } }).data.items.map(
            (t) => t.id,
          ),
        ).not.toContain(env.admin.user.id);
      });
  });
});
