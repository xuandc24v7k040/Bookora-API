import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthProvider, UserType } from '@/generated/prisma/client';
import type { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { PasswordRecoveryService } from './password-recovery.service';

jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  return {
    ...actual,
    compare: jest.fn(),
    hash: jest.fn(),
  };
});

const compareMock = bcrypt.compare as jest.Mock;
const hashMock = bcrypt.hash as jest.Mock;

const user = {
  id: '01K1CUSTOMER00000000000001',
  email: 'customer@example.test',
  passwordHash: 'old-password-hash',
  fullName: 'Customer',
  phone: null,
  gender: null,
  birthday: null,
  avatarUrl: null,
  type: UserType.CUSTOMER,
  provider: AuthProvider.LOCAL,
  googleId: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validToken = {
  id: '01K1TOKEN00000000000000001',
  userId: user.id,
  tokenHash: 'a'.repeat(64),
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  revokedAt: null,
  createdAt: new Date(),
  user,
};

describe('PasswordRecoveryService', () => {
  const tokens = {
    findUserByEmail: jest.fn(),
    createReplacingActive: jest.fn(),
    revokeIfActive: jest.fn(),
    findByHash: jest.fn(),
  };
  const attempts = {
    normalizeEmail: jest.fn((email: string) => email.trim().toLowerCase()),
    consume: jest.fn(),
  };
  const authSessions = {
    revokeActiveByUserId: jest.fn(),
  };
  const authService = {
    clearAuthCookies: jest.fn(),
  };
  const mailService = {
    sendPasswordReset: jest.fn(),
  };
  const configValues: Record<string, unknown> = {
    'mail.passwordReset.ttlMinutes': 2,
    'mail.passwordReset.tokenHashSecret':
      'test-password-reset-secret-at-least-32-characters',
    'app.frontendUrl': 'http://localhost:5173',
  };
  const configService = {
    getOrThrow: jest.fn((key: string) => configValues[key]),
  };
  const tx = {
    passwordResetToken: {
      updateMany: jest.fn(),
    },
    user: {
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const response = {} as Response;
  let service: PasswordRecoveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    compareMock.mockReset();
    hashMock.mockReset();
    tokens.createReplacingActive.mockResolvedValue(validToken);
    tokens.revokeIfActive.mockResolvedValue({ count: 1 });
    attempts.consume.mockResolvedValue(undefined);
    authSessions.revokeActiveByUserId.mockResolvedValue({ count: 2 });
    mailService.sendPasswordReset.mockResolvedValue(undefined);
    tx.passwordResetToken.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 1 });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    service = new PasswordRecoveryService(
      tokens as never,
      attempts as never,
      authSessions as never,
      authService as never,
      mailService as never,
      configService as never,
      prisma as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('uses the configured two-minute TTL for persistence and mail', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
    tokens.findUserByEmail.mockResolvedValue(user);

    const result = await service.forgotPassword(
      ' Customer@Example.Test ',
      '127.0.0.1',
    );

    expect(result.success).toBe(true);
    expect(attempts.consume.mock.invocationCallOrder[0]).toBeLessThan(
      tokens.findUserByEmail.mock.invocationCallOrder[0],
    );
    const createInput = tokens.createReplacingActive.mock.calls[0]?.[0];
    expect(createInput.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createInput.tokenHash).not.toContain('reset-password');
    expect(createInput.now).toEqual(new Date('2026-07-29T00:00:00.000Z'));
    expect(createInput.expiresAt).toEqual(new Date('2026-07-29T00:02:00.000Z'));
    const mailInput = mailService.sendPasswordReset.mock.calls[0]?.[0];
    const rawToken = new URL(mailInput.resetUrl).searchParams.get('token');
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createInput.tokenHash).not.toBe(rawToken);
    expect(mailInput.ttlMinutes).toBe(2);
  });

  it('returns the product-approved email-not-found code without token or mail', async () => {
    tokens.findUserByEmail.mockResolvedValue(null);

    await expect(
      service.forgotPassword('missing@example.test', '127.0.0.1'),
    ).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({
        code: 'PASSWORD_RESET_EMAIL_NOT_FOUND',
      }),
    });
    expect(tokens.createReplacingActive).not.toHaveBeenCalled();
    expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('returns the product-approved Google provider code without a token', async () => {
    tokens.findUserByEmail.mockResolvedValue({
      ...user,
      provider: AuthProvider.GOOGLE,
      passwordHash: null,
    });

    await expect(
      service.forgotPassword('customer@example.test', '127.0.0.1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PASSWORD_RESET_UNSUPPORTED_GOOGLE_PROVIDER',
      }),
    });
    expect(tokens.createReplacingActive).not.toHaveBeenCalled();
    expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it.each([
    ['inactive customer', { isActive: false }],
    ['non-customer account', { type: UserType.SYSTEM }],
  ])('does not create a token or send mail for an %s', async (_, patch) => {
    tokens.findUserByEmail.mockResolvedValue({ ...user, ...patch });

    await expect(
      service.forgotPassword('customer@example.test', '127.0.0.1'),
    ).resolves.toEqual({
      success: true,
      message:
        'Nếu email tồn tại trong hệ thống, Bookora đã gửi hướng dẫn đặt lại mật khẩu.',
    });
    expect(tokens.createReplacingActive).not.toHaveBeenCalled();
    expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('revokes the exact newly created token when delivery fails', async () => {
    tokens.findUserByEmail.mockResolvedValue(user);
    mailService.sendPasswordReset.mockRejectedValue(new Error('provider raw'));
    jest
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation();

    await expect(
      service.forgotPassword('customer@example.test', '127.0.0.1'),
    ).resolves.toMatchObject({ success: true });

    expect(tokens.revokeIfActive).toHaveBeenCalledWith(
      validToken.id,
      expect.any(Date),
    );
  });

  it.each([
    ['EXPIRED', { expiresAt: new Date(0) }, 'PASSWORD_RESET_TOKEN_EXPIRED'],
    ['USED', { usedAt: new Date() }, 'PASSWORD_RESET_TOKEN_USED'],
    ['REVOKED', { revokedAt: new Date() }, 'PASSWORD_RESET_TOKEN_REVOKED'],
  ])('maps %s token state without consuming it', async (_, patch, code) => {
    tokens.findByHash.mockResolvedValue({ ...validToken, ...patch });

    await expect(service.validateToken('a'.repeat(43))).rejects.toMatchObject({
      response: expect.objectContaining({ code }),
    });
    expect(tx.passwordResetToken.updateMany).not.toHaveBeenCalled();
  });

  it('treats expiresAt equal to now as expired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-28T10:00:00.000Z'));
    tokens.findByHash.mockResolvedValue({
      ...validToken,
      expiresAt: new Date('2026-07-28T10:00:00.000Z'),
    });

    await expect(service.validateToken('a'.repeat(43))).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PASSWORD_RESET_TOKEN_EXPIRED',
      }),
    });
    jest.useRealTimers();
  });

  it('atomically changes the password, consumes once, revokes all sessions and clears cookies', async () => {
    tokens.findByHash.mockResolvedValue(validToken);
    compareMock.mockResolvedValue(false);
    hashMock.mockResolvedValue('new-password-hash');

    await expect(
      service.resetPassword('a'.repeat(43), 'Password2', response),
    ).resolves.toEqual({ success: true });

    expect(tx.passwordResetToken.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: validToken.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
        data: { usedAt: expect.any(Date) },
      }),
    );
    expect(tx.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: user.id,
          passwordHash: user.passwordHash,
        }),
        data: { passwordHash: 'new-password-hash' },
      }),
    );
    expect(authSessions.revokeActiveByUserId).toHaveBeenCalledWith(
      user.id,
      tx,
      expect.any(Date),
    );
    expect(authService.clearAuthCookies).toHaveBeenCalledWith(response);
  });

  it('rejects a password equal to the current password before mutation', async () => {
    tokens.findByHash.mockResolvedValue(validToken);
    compareMock.mockResolvedValue(true);

    await expect(
      service.resetPassword('a'.repeat(43), 'Password1', response),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows only one success when the same token is reset concurrently', async () => {
    tokens.findByHash.mockResolvedValue(validToken);
    compareMock.mockResolvedValue(false);
    hashMock.mockResolvedValue('new-password-hash');
    let consumed = false;
    tx.passwordResetToken.updateMany.mockReset();
    tx.passwordResetToken.updateMany.mockImplementation((input) => {
      if ('usedAt' in input.data) {
        if (consumed) return Promise.resolve({ count: 0 });
        consumed = true;
      }
      return Promise.resolve({ count: 1 });
    });

    const results = await Promise.allSettled([
      service.resetPassword('a'.repeat(43), 'Password2', response),
      service.resetPassword('a'.repeat(43), 'Password2', response),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
  });
});
