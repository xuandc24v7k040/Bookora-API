import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApplication } from '../src/core/app.setup';
import {
  type AuthAttempt,
  AuthAttemptType,
  AuthProvider,
  UserType,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import {
  MAIL_PROVIDER,
  type MailProvider,
  type SendMailInput,
} from '../src/modules/mail/mail-provider.interface';
import { TurnstileService } from '../src/modules/auth/turnstile.service';

describe('customer password recovery HTTP flow (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let priorIpAttempts: AuthAttempt[] = [];
  const sentMessages: SendMailInput[] = [];
  const email = `phase17-5-${Date.now()}@example.test`;
  const googleEmail = `phase17-5-google-${Date.now()}@example.test`;
  const oldPassword = 'OldPassword1';
  const newPassword = 'NewPassword2';

  beforeAll(async () => {
    const fakeMailProvider: MailProvider = {
      send: jest.fn((input: SendMailInput) => {
        sentMessages.push(input);
        return Promise.resolve();
      }),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAIL_PROVIDER)
      .useValue(fakeMailProvider)
      .overrideProvider(TurnstileService)
      .useValue({ verifyToken: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleFixture.createNestApplication();
    setupApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    priorIpAttempts = await prisma.authAttempt.findMany({
      where: {
        type: {
          in: [AuthAttemptType.PASSWORD_RESET_IP, AuthAttemptType.IP],
        },
        key: '127.0.0.1',
      },
    });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({
      where: { email: { in: [email, googleEmail] } },
    });
    await prisma?.authAttempt.deleteMany({
      where: {
        OR: [
          { type: AuthAttemptType.PASSWORD_RESET_EMAIL, key: email },
          { type: AuthAttemptType.PASSWORD_RESET_IP, key: '127.0.0.1' },
          { type: AuthAttemptType.EMAIL, key: email },
          { type: AuthAttemptType.PASSWORD_RESET_EMAIL, key: googleEmail },
          {
            type: AuthAttemptType.PASSWORD_RESET_EMAIL,
            key: 'missing@example.test',
          },
          { type: AuthAttemptType.IP, key: '127.0.0.1' },
        ],
      },
    });
    if (priorIpAttempts.length > 0) {
      await prisma?.authAttempt.createMany({ data: priorIpAttempts });
    }
    await app?.close();
  });

  it('sends, validates and consumes a one-time reset token, revokes sessions, then accepts only the new password', async () => {
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Phase 17.5 Customer',
        passwordHash: await bcrypt.hash(oldPassword, 12),
        type: UserType.CUSTOMER,
        provider: AuthProvider.LOCAL,
        isActive: true,
      },
    });
    const googleUser = await prisma.user.create({
      data: {
        email: googleEmail,
        fullName: 'Phase 17.5 Google Customer',
        type: UserType.CUSTOMER,
        provider: AuthProvider.GOOGLE,
        googleId: `phase17-5-google-${Date.now()}`,
        isActive: true,
      },
    });
    await prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: `phase17-5-session-${Date.now()}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const agent = request.agent(app.getHttpServer());
    const csrfResponse = await agent.get('/api/v1/auth/csrf-token').expect(200);
    let csrfToken = (csrfResponse.body as { data: { csrfToken: string } }).data
      .csrfToken;

    await agent
      .post('/api/v1/auth/forgot-password')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'missing@example.test' })
      .expect(404)
      .expect(({ body }) => {
        expect(body.code).toBe('PASSWORD_RESET_EMAIL_NOT_FOUND');
      });
    expect(sentMessages).toHaveLength(0);

    await agent
      .post('/api/v1/auth/forgot-password')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: googleEmail })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('PASSWORD_RESET_UNSUPPORTED_GOOGLE_PROVIDER');
      });
    await expect(
      prisma.passwordResetToken.count({ where: { userId: googleUser.id } }),
    ).resolves.toBe(0);
    expect(sentMessages).toHaveLength(0);

    await agent
      .post('/api/v1/auth/forgot-password')
      .set('X-CSRF-Token', csrfToken)
      .send({ email })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ success: true });
      });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]).toMatchObject({
      to: email,
      subject: expect.stringContaining('Bookora'),
    });
    const firstResetUrl = sentMessages[0]?.text.match(
      /https?:\/\/\S+\/reset-password\?token=([A-Za-z0-9_-]{43})/,
    );
    expect(firstResetUrl?.[1]).toHaveLength(43);
    const firstRawToken = firstResetUrl?.[1];
    if (!firstRawToken)
      throw new Error('First password reset URL did not contain a token');

    await agent
      .post('/api/v1/auth/forgot-password')
      .set('X-CSRF-Token', csrfToken)
      .send({ email })
      .expect(200);
    expect(sentMessages).toHaveLength(2);
    const secondResetUrl = sentMessages[1]?.text.match(
      /https?:\/\/\S+\/reset-password\?token=([A-Za-z0-9_-]{43})/,
    );
    const rawToken = secondResetUrl?.[1];
    if (!rawToken)
      throw new Error('Password reset URL did not contain a token');

    await agent
      .post('/api/v1/auth/reset-password/validate')
      .set('X-CSRF-Token', csrfToken)
      .send({ token: firstRawToken })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('PASSWORD_RESET_TOKEN_REVOKED');
      });

    const storedToken = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    expect(storedToken.tokenHash).not.toBe(rawToken);

    await agent
      .post('/api/v1/auth/reset-password/validate')
      .set('X-CSRF-Token', csrfToken)
      .send({ token: rawToken })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ status: 'VALID' });
      });

    const resetResponse = await agent
      .post('/api/v1/auth/reset-password')
      .set('X-CSRF-Token', csrfToken)
      .send({ token: rawToken, newPassword })
      .expect(200);
    expect(resetResponse.body.data).toEqual({ success: true });
    const setCookieHeader = resetResponse.headers['set-cookie'];
    const setCookies = Array.isArray(setCookieHeader)
      ? setCookieHeader.join(';')
      : (setCookieHeader ?? '');
    expect(setCookies).toContain('accessToken=;');
    expect(setCookies).toContain('refreshToken=;');
    expect(setCookies).toContain('csrfToken=;');

    const [updatedUser, session, consumedToken] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.authSession.findFirstOrThrow({ where: { userId: user.id } }),
      prisma.passwordResetToken.findUniqueOrThrow({
        where: { id: storedToken.id },
      }),
    ]);
    await expect(
      bcrypt.compare(newPassword, updatedUser.passwordHash!),
    ).resolves.toBe(true);
    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(consumedToken.usedAt).toBeInstanceOf(Date);

    const renewedCsrfResponse = await agent
      .get('/api/v1/auth/csrf-token')
      .expect(200);
    csrfToken = (renewedCsrfResponse.body as { data: { csrfToken: string } })
      .data.csrfToken;

    await agent
      .post('/api/v1/auth/reset-password')
      .set('X-CSRF-Token', csrfToken)
      .send({ token: rawToken, newPassword: 'AnotherPassword3' })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('PASSWORD_RESET_TOKEN_USED');
      });

    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password: oldPassword })
      .expect(401);
    await agent
      .post('/api/v1/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email, password: newPassword })
      .expect(200);
  });
});
