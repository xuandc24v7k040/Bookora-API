import request from 'supertest';
import { ulid } from 'ulid';
import { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';
import { SupportFilesService } from '@/modules/support/support-files.service';
import { createNotificationEnvironment } from './helpers/notification-environment';
import { supportFileFixtures } from './helpers/support-files';

describe('Support files — isolated real private R2 objects and PostgreSQL', () => {
  jest.setTimeout(180000);
  let env: Awaited<ReturnType<typeof createNotificationEnvironment>>;
  let ticketId: string;
  const objectKeys = new Set<string>();
  let png: Buffer;

  beforeAll(async () => {
    env = await createNotificationEnvironment();
    png = (await supportFileFixtures()).png;
    const result = await request(env.app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Cookie', env.customerA.cookie)
      .set('X-CSRF-Token', env.csrf)
      .send({
        type: 'GENERAL',
        branchId: env.branches[0].id,
        message: { text: 'Private R2 verification', clientMessageId: ulid() },
      })
      .expect(201);
    ticketId = result.body.data.ticketId as string;
    await request(env.app.getHttpServer())
      .post(`/api/v1/support/tickets/${ticketId}/claim`)
      .set('Cookie', env.admin.cookie)
      .set('X-CSRF-Token', env.csrf)
      .set('X-Branch-Id', env.branches[0].id)
      .expect(201);
  });
  afterAll(async () => {
    if (!env) return;
    for (const row of await env.prisma.supportAttachment.findMany({
      select: { objectKey: true },
    }))
      objectKeys.add(row.objectKey);
    for (const key of objectKeys)
      await env.app
        .get(R2ObjectStorageService)
        .delete({ visibility: 'private', key });
    await env.close();
  });

  const upload = (
    filename: string,
    mime: string,
    bytes: Buffer,
    who?: string,
  ) =>
    request(env.app.getHttpServer())
      .post('/api/v1/support/attachments')
      .set('Cookie', who ?? env.customerA.cookie)
      .set('X-CSRF-Token', env.csrf)
      .set('X-Branch-Id', env.branches[0].id)
      .field('ticketId', ticketId)
      .attach('file', bytes, { filename, contentType: mime });
  const send = (ids: string[], key = ulid(), who?: string) =>
    request(env.app.getHttpServer())
      .post(`/api/v1/support/tickets/${ticketId}/messages`)
      .set('Cookie', who ?? env.customerA.cookie)
      .set('X-CSRF-Token', env.csrf)
      .set('X-Branch-Id', env.branches[0].id)
      .send({ clientMessageId: key, attachmentIds: ids });
  const download = (
    id: string,
    cookie: string,
    branchId = env.branches[0].id,
  ) =>
    request(env.app.getHttpServer())
      .get(`/api/v1/support/attachments/${id}/content`)
      .set('Cookie', cookie)
      .set('X-Branch-Id', branchId);

  it('uploads each allowed real object and permits only current ticket readers', async () => {
    const fixtures = (await supportFileFixtures()).fixtures;
    // Public MDN media used only as valid bounded codec fixtures; never user media.
    for (const [extension, mime] of [
      ['mp4', 'video/mp4'],
      ['webm', 'video/webm'],
    ]) {
      const res = await fetch(
        `https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.${extension}`,
        { signal: AbortSignal.timeout(30000) },
      );
      expect(res.ok).toBe(true);
      fixtures.push({
        filename: `support.${extension}`,
        mime,
        bytes: Buffer.from(await res.arrayBuffer()),
      });
    }
    for (const fixture of fixtures) {
      const staged = await upload(
        fixture.filename,
        fixture.mime,
        fixture.bytes,
      ).expect(201);
      const id = staged.body.data.id as string;
      expect(JSON.stringify(staged.body)).not.toMatch(
        /objectKey|https:|bucket/,
      );
      await send([id]).expect(201);
      const owner = await download(id, env.customerA.cookie).expect(200);
      expect(Number(owner.headers['content-length'])).toBe(
        fixture.bytes.length,
      );
      expect(owner.headers['cache-control']).toBe('private, no-store');
      expect(owner.headers['x-content-type-options']).toBe('nosniff');
      expect(owner.headers['content-disposition']).toContain(
        fixture.mime.startsWith('image/') ? 'inline' : 'attachment',
      );
      await download(id, env.admin.cookie).expect(200);
      await download(id, env.customerB.cookie).expect(404);
      await download(id, env.cashier.cookie).expect(404);
      await download(id, env.admin.cookie, env.branches[1].id).expect(404);
    }
  });

  it('denies anonymous and permission-revoked access to a previously readable PDF', async () => {
    const pdf = await env.prisma.supportAttachment.findFirstOrThrow({
      where: { mimeType: 'application/pdf', messageId: { not: null } },
    });
    const assignment = await env.prisma.userBranch.findFirstOrThrow({
      where: { userId: env.readonly.user.id, branchId: env.branches[0].id },
    });
    const permission = await env.prisma.permission.findUniqueOrThrow({
      where: { code: 'support.read' },
    });
    await env.prisma.userBranchPermission.create({
      data: {
        userBranchId: assignment.id,
        permissionId: permission.id,
        effect: 'ALLOW',
      },
    });
    await download(pdf.id, env.readonly.cookie).expect(200);
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
    await download(pdf.id, env.readonly.cookie).expect(404);
    await request(env.app.getHttpServer())
      .get(`/api/v1/support/attachments/${pdf.id}/content`)
      .expect(401);
    await download(pdf.id, env.customerA.cookie).expect(200);
  });

  it('accepts exactly 10 MiB and rejects 1 byte over, MIME spoof, malformed archives and unsafe types', async () => {
    const boundary = Buffer.concat([
      png,
      Buffer.alloc(10 * 1024 * 1024 - png.length),
    ]);
    const result = await upload('boundary.png', 'image/png', boundary).expect(
      201,
    );
    await send([result.body.data.id as string]).expect(201);
    await upload(
      'over.png',
      'image/png',
      Buffer.concat([boundary, Buffer.alloc(1)]),
    ).expect(413);
    await upload(
      'spoof.png',
      'image/png',
      Buffer.from('<script>alert(1)</script>'),
    ).expect(400);
    await upload('mismatch.pdf', 'image/png', png).expect(400);
    await upload(
      'bad.zip',
      'application/zip',
      Buffer.from('PK\x03\x04malformed'),
    ).expect(400);
    await upload('script.svg', 'image/svg+xml', Buffer.from('<svg/>')).expect(
      400,
    );
    await send(Array.from({ length: 6 }, () => ulid())).expect(400);
  });

  it('blocks staged hijack/cross-scope/reuse and retries one committed file-only message', async () => {
    const staged = await upload('test.png', 'image/png', png).expect(201);
    const id = staged.body.data.id as string;
    await send([id], ulid(), env.admin.cookie).expect(400);
    await download(id, env.customerA.cookie).expect(404);
    const key = ulid();
    const first = await send([id], key).expect(201);
    const retry = await send([id], key).expect(201);
    expect(retry.body.data.message.id).toBe(first.body.data.message.id);
    await send([id]).expect(400);
    const foreign = await request(env.app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Cookie', env.customerB.cookie)
      .set('X-CSRF-Token', env.csrf)
      .send({
        type: 'GENERAL',
        branchId: env.branches[0].id,
        message: { attachmentIds: [id], clientMessageId: ulid() },
      })
      .expect(400);
    expect(foreign.status).toBe(400);
  });

  it('keeps a fresh staged upload until its UTC expiry', async () => {
    const staged = await upload('not-expired.png', 'image/png', png).expect(
      201,
    );
    const id = staged.body.data.id as string;
    const row = await env.prisma.supportAttachment.findUniqueOrThrow({
      where: { id },
    });
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3_500_000);
    await env.app.get(SupportFilesService).cleanup();
    expect(
      await env.prisma.supportAttachment.findUnique({ where: { id } }),
    ).not.toBeNull();
    await send([id]).expect(201);
  });

  it('expiry cleanup removes only unattached objects; revoked readers lose private access immediately', async () => {
    const staged = await upload('expire.png', 'image/png', png).expect(201);
    const id = staged.body.data.id as string;
    const row = await env.prisma.supportAttachment.update({
      where: { id },
      data: { expiresAt: new Date(0) },
    });
    await env.app.get(SupportFilesService).cleanup();
    expect(
      await env.prisma.supportAttachment.findUnique({ where: { id } }),
    ).toBeNull();
    await expect(
      env.app.get(R2ObjectStorageService).readPrivate(row.objectKey),
    ).rejects.toThrow();
    const attached = await env.prisma.supportAttachment.findFirstOrThrow({
      where: { messageId: { not: null } },
    });
    await env.prisma.userBranch.updateMany({
      where: { userId: env.admin.user.id },
      data: { isActive: false, isPrimary: false },
    });
    await download(attached.id, env.admin.cookie).expect(404);
    await download(attached.id, env.customerA.cookie).expect(200);
  });
});
