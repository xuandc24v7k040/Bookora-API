import { EmailVerificationService } from './email-verification.service';

describe('EmailVerificationService clock/config boundaries', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  const user = {
    id: 'user',
    email: 'clock@example.test',
    isActive: true,
    type: 'CUSTOMER',
    provider: 'LOCAL',
    emailVerificationRequired: true,
    emailVerifiedAt: null,
  };
  const token = {
    id: 'token',
    userId: user.id,
    usedAt: null,
    revokedAt: null,
    expiresAt: new Date(now.getTime() + 1),
    user,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: { findUnique: jest.fn(), update: jest.fn() },
    emailVerificationToken: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
    emailVerificationToken: { findUnique: jest.fn() },
  };
  const mail = { sendEmailVerification: jest.fn() };
  const config = {
    getOrThrow: jest.fn(
      (key: string) =>
        ({
          'mail.emailVerification.ttlMinutes': 7,
          'mail.emailVerification.resendCooldownSeconds': 60,
          'mail.passwordReset.tokenHashSecret':
            'test-secret-purpose-separation',
          'app.frontendUrl': 'http://localhost:15173',
        })[key],
    ),
  };
  const service = new EmailVerificationService(
    prisma as never,
    config as never,
    mail as never,
    {} as never,
  );

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    tx.user.findUnique.mockResolvedValue(user);
    tx.emailVerificationToken.findFirst.mockResolvedValue(null);
    tx.emailVerificationToken.create.mockResolvedValue({ id: 'new' });
    tx.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailVerificationToken.findUnique.mockResolvedValue(token);
    tx.emailVerificationToken.findUnique.mockResolvedValue(token);
    mail.sendEmailVerification.mockResolvedValue(undefined);
  });
  afterEach(() => jest.useRealTimers());

  it('uses configured verification TTL for both expiry and mail independently of password-reset TTL', async () => {
    await service.sendForUser(user.id);
    expect(tx.emailVerificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7 * 60_000),
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(mail.sendEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        ttlMinutes: 7,
        verificationUrl: expect.stringMatching(/\/verify-email#token=/),
      }),
    );
    expect(config.getOrThrow).not.toHaveBeenCalledWith(
      'mail.passwordReset.ttlMinutes',
    );
  });

  it('accepts strictly before expiresAt and rejects exactly at expiresAt without consuming', async () => {
    await expect(service.verify('opaque')).resolves.toEqual({ success: true });
    tx.emailVerificationToken.updateMany.mockClear();
    jest.setSystemTime(token.expiresAt);
    await expect(service.verify('opaque')).rejects.toMatchObject({
      response: { code: 'EMAIL_VERIFICATION_EXPIRED' },
    });
    expect(tx.emailVerificationToken.updateMany).not.toHaveBeenCalled();
  });
});
