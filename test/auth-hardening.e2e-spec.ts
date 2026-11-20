import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import type { Profile } from 'passport-google-oauth20';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthProvider, UserType } from '../src/generated/prisma/client';
import { createAuthHardeningEnvironment } from './helpers/auth-hardening-environment';
import type { PrismaService } from '../src/database/prisma.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import type { GoogleStrategy } from '../src/modules/auth/strategies/google.strategy';

describe('Auth hardening — disposable PostgreSQL + real Resend HTTP capture', () => {
  jest.setTimeout(180_000);
  let env: Awaited<ReturnType<typeof createAuthHardeningEnvironment>>;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auth: AuthService;
  let google: GoogleStrategy;
  const password = 'BookoraTest123';
  let sequence = 0;
  const email = () => `auth-${++sequence}@example.test`;
  const profile = (
    mail: string,
    sub = `subject-${++sequence}`,
    verified: unknown = true,
  ) =>
    google.validate('', '', {
      id: sub,
      displayName: 'Khách kiểm thử',
      provider: 'google',
      emails: [{ value: mail, verified: verified === true }],
      _json: { email_verified: verified },
      _raw: '',
    } as Profile);
  const response = () =>
    ({ cookie: jest.fn(), clearCookie: jest.fn() }) as unknown as Response;

  beforeAll(async () => {
    env = await createAuthHardeningEnvironment();
    const { AppModule } = await import('../src/app.module.js');
    const { setupApplication } = await import('../src/core/app.setup.js');
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication({ logger: false });
    setupApplication(app);
    await app.init();
    const { PrismaService } = await import('../src/database/prisma.service.js');
    const { AuthService } = await import('../src/modules/auth/auth.service.js');
    const { GoogleStrategy } =
      await import('../src/modules/auth/strategies/google.strategy.js');
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    google = app.get(GoogleStrategy);
    const [connected] = await prisma.$queryRaw<
      Array<{ name: string }>
    >`SELECT current_database() AS name`;
    expect(connected?.name).toBe(env.database.databaseName);
    await prisma.role.findUniqueOrThrow({ where: { code: 'CUSTOMER' } });
  });

  afterAll(async () => {
    await app?.close();
    await env?.close();
  });

  async function browser() {
    const agent = request.agent(app.getHttpServer());
    const csrf = await agent.get('/api/v1/auth/csrf-token').expect(200);
    return {
      agent,
      csrf: (csrf.body as { data: { csrfToken: string } }).data.csrfToken,
    };
  }
  type Browser = Awaited<ReturnType<typeof browser>>;
  function post(b: Browser, path: string, body: object) {
    return b.agent
      .post(`/api/v1/${path}`)
      .set('X-CSRF-Token', b.csrf)
      .send(body);
  }
  async function register() {
    const b = await browser();
    const mail = email();
    const result = await post(b, 'auth/register', {
      fullName: 'Khách kiểm thử',
      email: mail,
      password,
    }).expect(201);
    return {
      b,
      mail,
      userId: (result.body as { data: { id: string } }).data.id,
      result,
    };
  }
  function lastToken(): string {
    const html = env.messages.at(-1)!.html;
    const href = html.match(/href="([^"]*\/verify-email[^"]*)"/)?.[1];
    if (!href) throw new Error('Missing verification CTA');
    return new URLSearchParams(
      new URL(href.replace(/&amp;/g, '&')).hash.slice(1),
    ).get('token')!;
  }
  async function allowResend(userId: string) {
    await prisma.emailVerificationToken.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    await prisma.authAttempt.deleteMany({
      where: {
        type: { in: ['EMAIL_VERIFICATION_EMAIL', 'EMAIL_VERIFICATION_IP'] },
      },
    });
  }

  it('applies all migrations, and registers → captures branded mail → rejects pre-verify → verifies → logs in', async () => {
    expect(env.migrationOutput).toContain(
      '20261120090000_customer_email_verification',
    );
    const { b, mail, userId, result } = await register();
    expect(result.body.data).toMatchObject({
      verificationRequired: true,
      verificationDelivery: 'SENT',
    });
    expect(result.headers['set-cookie']).toBeUndefined();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({
      isActive: true,
      emailVerificationRequired: true,
      emailVerifiedAt: null,
    });
    const message = env.messages.at(-1)!;
    expect(message.subject).toBe('Xác thực email Bookora');
    expect(message.html).toContain('#356244');
    expect(message.html).toContain('2 phút');
    expect(message.text).toContain('2 phút');
    const token = lastToken();
    const row = await prisma.emailVerificationToken.findFirstOrThrow({
      where: { userId },
    });
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.tokenHash).not.toBe(token);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(120_000);
    await post(b, 'auth/login', { email: mail, password })
      .expect(403)
      .expect(({ body }) =>
        expect(body.code).toBe('EMAIL_VERIFICATION_REQUIRED'),
      );
    expect(await prisma.authSession.count({ where: { userId } })).toBe(0);
    await post(b, 'auth/email-verification/verify', { token }).expect(200);
    expect(await prisma.authSession.count({ where: { userId } })).toBe(0);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .emailVerifiedAt,
    ).not.toBeNull();
    await post(b, 'auth/email-verification/verify', { token })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('EMAIL_VERIFICATION_USED'));
    await post(b, 'auth/login', { email: mail, password }).expect(200);
    await b.agent.get('/api/v1/auth/me').expect(200);
  });

  it('rejects invalid/expired tokens, including exact expiry boundary', async () => {
    const { b, userId } = await register();
    const token = lastToken();
    await post(b, 'auth/email-verification/verify', { token: 'a'.repeat(43) })
      .expect(400)
      .expect(({ body }) =>
        expect(body.code).toBe('EMAIL_VERIFICATION_INVALID'),
      );
    await prisma.emailVerificationToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date() },
    });
    await post(b, 'auth/email-verification/verify', { token })
      .expect(400)
      .expect(({ body }) =>
        expect(body.code).toBe('EMAIL_VERIFICATION_EXPIRED'),
      );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .emailVerifiedAt,
    ).toBeNull();
  });

  it('resend invalidates old links and enforces atomic cooldown under concurrent requests', async () => {
    const { b, mail, userId } = await register();
    const oldToken = lastToken();
    await allowResend(userId);
    const before = env.messages.length;
    const results = await Promise.all([
      post(b, 'auth/email-verification/resend', { email: mail }),
      post(b, 'auth/email-verification/resend', { email: mail }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(env.messages.length - before).toBe(1);
    const newToken = lastToken();
    await post(b, 'auth/email-verification/verify', { token: oldToken })
      .expect(400)
      .expect(({ body }) =>
        expect(body.code).toBe('EMAIL_VERIFICATION_REVOKED'),
      );
    await post(b, 'auth/email-verification/verify', { token: newToken }).expect(
      200,
    );
  });

  it('one of two simultaneous verifies wins without a 500 or duplicate consumption', async () => {
    const { b, userId } = await register();
    const token = lastToken();
    const results = await Promise.all([
      post(b, 'auth/email-verification/verify', { token }),
      post(b, 'auth/email-verification/verify', { token }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(
      await prisma.emailVerificationToken.count({
        where: { userId, usedAt: { not: null } },
      }),
    ).toBe(1);
  });

  it('returns neutral resend results for missing, Google, inactive, legacy, and verified accounts', async () => {
    await prisma.authAttempt.deleteMany({
      where: {
        type: { in: ['EMAIL_VERIFICATION_EMAIL', 'EMAIL_VERIFICATION_IP'] },
      },
    });
    const b = await browser();
    const samples = [email()];
    for (const fields of [
      { provider: AuthProvider.GOOGLE, googleId: `g-${sequence}` },
      { isActive: false },
      { emailVerifiedAt: new Date() },
      { emailVerificationRequired: false },
    ]) {
      const user = await prisma.user.create({
        data: { email: email(), emailVerificationRequired: true, ...fields },
      });
      samples.push(user.email);
    }
    const before = env.messages.length;
    const bodies: unknown[] = [];
    for (const mail of samples)
      bodies.push(
        (
          await post(b, 'auth/email-verification/resend', {
            email: mail,
          }).expect(200)
        ).body.data,
      );
    expect(
      bodies.every(
        (body) => JSON.stringify(body) === JSON.stringify(bodies[0]),
      ),
    ).toBe(true);
    expect(env.messages).toHaveLength(before);
  });

  it('records delivery failure truthfully and recovers via resend', async () => {
    env.failDelivery(true);
    const { b, mail, userId, result } = await register();
    env.failDelivery(false);
    expect(result.body.data.verificationDelivery).toBe('FAILED');
    expect(
      await prisma.emailVerificationToken.count({
        where: { userId, revokedAt: { not: null } },
      }),
    ).toBe(1);
    await allowResend(userId);
    await post(b, 'auth/email-verification/resend', { email: mail }).expect(
      200,
    );
    await post(b, 'auth/email-verification/verify', {
      token: lastToken(),
    }).expect(200);
  });

  it('isolates reset/verification token purposes and reset does not bypass verification', async () => {
    const { b, mail, userId } = await register();
    const verificationToken = lastToken();
    await post(b, 'auth/reset-password', {
      token: verificationToken,
      newPassword: 'NewPassword456',
    }).expect(400);
    await post(b, 'auth/forgot-password', { email: mail }).expect(200);
    const href = env.messages
      .at(-1)!
      .html.match(/href="([^"]*\/reset-password[^"]*)"/)![1];
    const resetToken = new URL(href.replace(/&amp;/g, '&')).searchParams.get(
      'token',
    )!;
    await post(b, 'auth/email-verification/verify', {
      token: resetToken,
    }).expect(400);
    await post(b, 'auth/reset-password', {
      token: resetToken,
      newPassword: 'NewPassword456',
    }).expect(200);
    const refreshed = await b.agent.get('/api/v1/auth/csrf-token').expect(200);
    b.csrf = refreshed.body.data.csrfToken as string;
    await post(b, 'auth/login', {
      email: mail,
      password: 'NewPassword456',
    }).expect(403);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .emailVerifiedAt,
    ).toBeNull();
  });

  it('keeps legacy login, A+B sessions, logout only A, real rotation/replay, change and reset semantics', async () => {
    const { hash } = await import('bcrypt');
    const role = await prisma.role.findUniqueOrThrow({
      where: { code: 'CUSTOMER' },
    });
    const user = await prisma.user.create({
      data: {
        email: email(),
        passwordHash: await hash(password, 12),
        userRoles: { create: { roleId: role.id } },
      },
    });
    expect(user.emailVerificationRequired).toBe(false);
    expect(user.emailVerifiedAt).toBeNull();
    let a = await browser();
    const b = await browser();
    await post(a, 'auth/login', { email: user.email, password }).expect(200);
    await post(b, 'auth/login', { email: user.email, password }).expect(200);
    expect(
      await prisma.authSession.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(2);
    await post(a, 'auth/logout', {}).expect(200);
    await b.agent.get('/api/v1/auth/me').expect(200);
    const rotation = await post(b, 'auth/refresh', {}).expect(200);
    const oldRefresh = (rotation.headers['set-cookie'] as unknown as string[])
      .find((v) => v.startsWith('refreshToken='))!
      .split(';')[0];
    await post(b, 'auth/refresh', {}).expect(200);
    const beforeReplay = await prisma.authSession.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [oldRefresh, 'csrfToken=replay-test'])
      .set('X-CSRF-Token', 'replay-test')
      .send({})
      .expect(401);
    expect(
      (
        await prisma.authSession.findUniqueOrThrow({
          where: { id: beforeReplay.id },
        })
      ).revokedAt,
    ).not.toBeNull();
    a = await browser();
    const c = await browser();
    await post(a, 'auth/login', { email: user.email, password }).expect(200);
    await post(c, 'auth/login', { email: user.email, password }).expect(200);
    await post(a, 'account/change-password', {
      currentPassword: password,
      newPassword: 'ChangedPassword456',
    }).expect(201);
    await a.agent.get('/api/v1/auth/me').expect(200);
    await c.agent.get('/api/v1/auth/me').expect(401);
    await post(c, 'auth/refresh', {}).expect(401);
    await post(a, 'auth/forgot-password', { email: user.email }).expect(200);
    const href = env.messages
      .at(-1)!
      .html.match(/href="([^"]*\/reset-password[^"]*)"/)![1];
    const token = new URL(href.replace(/&amp;/g, '&')).searchParams.get(
      'token',
    )!;
    await post(a, 'auth/reset-password', {
      token,
      newPassword: 'ResetPassword789',
    }).expect(200);
    expect(
      await prisma.authSession.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    await a.agent.get('/api/v1/auth/me').expect(401);
  });

  it('strictly validates Google email_verified in the real profile adapter', () => {
    expect(profile(email(), 'g', true).emailVerified).toBe(true);
    for (const value of [false, 'false', 'true', 1, null])
      expect(profile(email(), 'g', value).emailVerified).toBe(false);
  });

  it('creates new GOOGLE CUSTOMER, reuses only matching subject, and handles concurrent creation safely', async () => {
    const p = profile(email());
    const before = env.messages.length;
    const results = await Promise.all([
      auth.loginWithGoogle(p, {}, response()),
      auth.loginWithGoogle(p, {}, response()),
    ]);
    expect(results[0].id).toBe(results[1].id);
    const user = await prisma.user.findUniqueOrThrow({
      where: { googleId: p.googleId },
    });
    expect(user).toMatchObject({
      type: UserType.CUSTOMER,
      provider: AuthProvider.GOOGLE,
      passwordHash: null,
    });
    expect(await prisma.authSession.count({ where: { userId: user.id } })).toBe(
      2,
    );
    expect(env.messages).toHaveLength(before);
    await expect(
      auth.loginWithGoogle({ ...p, googleId: 'other-subject' }, {}, response()),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      auth.loginWithGoogle({ ...p, email: email() }, {}, response()),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email,
    ).toBe(p.email);
    const b = await browser();
    await post(b, 'auth/login', { email: p.email, password }).expect(401);
    await post(b, 'auth/forgot-password', { email: p.email }).expect(400);
  });

  it.each([UserType.CUSTOMER, UserType.SYSTEM, UserType.BRANCH])(
    'denies LOCAL collision including old linked ID for %s without mutation or session',
    async (type) => {
      const p = profile(email());
      const user = await prisma.user.create({
        data: {
          email: p.email,
          type,
          googleId: p.googleId,
          provider: AuthProvider.LOCAL,
        },
      });
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      await expect(
        auth.loginWithGoogle(p, {}, response()),
      ).rejects.toMatchObject({ status: 401 });
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      ).toEqual(before);
      expect(
        await prisma.authSession.count({ where: { userId: user.id } }),
      ).toBe(0);
    },
  );

  it.each([UserType.SYSTEM, UserType.BRANCH])(
    'denies GOOGLE non-customer %s even with matching subject',
    async (type) => {
      const p = profile(email());
      await prisma.user.create({
        data: {
          email: p.email,
          type,
          googleId: p.googleId,
          provider: AuthProvider.GOOGLE,
        },
      });
      await expect(
        auth.loginWithGoogle(p, {}, response()),
      ).rejects.toMatchObject({ status: 401 });
    },
  );

  it('retains CSRF and signed state failures and safe OAuth callback UX', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/email-verification/resend')
      .send({ email: email() })
      .expect(403);
    const callback = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback?error=access_denied')
      .expect(302);
    expect(callback.headers.location).toBe(
      'http://localhost:15173/login?error=google_access_denied',
    );
    expect(callback.headers['set-cookie']).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^accessToken=.+/)]),
    );
  });
});
