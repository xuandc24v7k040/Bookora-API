import { HttpException, Logger } from '@nestjs/common';
import { AuthAttemptType } from '@/generated/prisma/client';
import { AuthAttemptService } from './auth-attempt.service';

describe('AuthAttemptService', () => {
  const repository = {
    findOne: jest.fn(),
    update: jest.fn(),
    recordFailedAttemptAtomic: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  };

  let service: AuthAttemptService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    config.get.mockImplementation((key: string) => {
      const values: Record<string, number> = {
        'auth.login.emailMaxFailedAttempts': 3,
        'auth.login.emailLockSeconds': 60,
        'auth.login.ipMaxFailedAttempts': 5,
        'auth.login.ipLockSeconds': 120,
        'auth.login.attemptWindowSeconds': 60,
      };
      return values[key];
    });
    service = new AuthAttemptService(repository as never, config as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes email consistently', () => {
    expect(service.normalizeEmail(' User@Example.COM ')).toBe(
      'user@example.com',
    );
  });

  it('records email and IP failures atomically', async () => {
    repository.recordFailedAttemptAtomic.mockResolvedValue({
      blockedUntil: null,
    });

    await expect(
      service.recordLoginFailure('user@example.com', '127.0.0.1'),
    ).resolves.toBeUndefined();

    expect(repository.recordFailedAttemptAtomic).toHaveBeenCalledWith({
      type: AuthAttemptType.EMAIL,
      key: 'user@example.com',
      maxAttempts: 3,
      lockSeconds: 60,
      windowSeconds: 60,
    });
    expect(repository.recordFailedAttemptAtomic).toHaveBeenCalledWith({
      type: AuthAttemptType.IP,
      key: '127.0.0.1',
      maxAttempts: 5,
      lockSeconds: 120,
      windowSeconds: 60,
    });
  });

  it('returns a generic response when email threshold locks', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    repository.recordFailedAttemptAtomic
      .mockResolvedValueOnce({ blockedUntil: futureDate() })
      .mockResolvedValueOnce({ blockedUntil: null });

    let error: HttpException | undefined;
    try {
      await service.recordLoginFailure('user@example.com', '127.0.0.1');
    } catch (caught) {
      error = caught as HttpException;
    }

    expect(error?.getStatus()).toBe(429);
    expect(error?.getResponse()).toBe(
      'Thông tin đăng nhập không hợp lệ hoặc yêu cầu tạm thời bị hạn chế. Vui lòng thử lại sau.',
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('email failure threshold'),
    );
  });

  it('keeps active email lock generic and still records the IP failure', async () => {
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ blockedUntil: futureDate() });
    repository.recordFailedAttemptAtomic.mockResolvedValue({
      blockedUntil: null,
    });

    let error: HttpException | undefined;
    try {
      await service.checkLoginBlocked('user@example.com', '127.0.0.1');
    } catch (caught) {
      error = caught as HttpException;
    }

    expect(error?.getStatus()).toBe(429);
    expect(error?.getResponse()).toBe(
      'Thông tin đăng nhập không hợp lệ hoặc yêu cầu tạm thời bị hạn chế. Vui lòng thử lại sau.',
    );
    expect(repository.recordFailedAttemptAtomic).toHaveBeenCalledWith(
      expect.objectContaining({ type: AuthAttemptType.IP }),
    );
  });

  it('resets email and IP records on successful login', async () => {
    repository.findOne
      .mockResolvedValueOnce({ id: 'email-attempt' })
      .mockResolvedValueOnce({ id: 'ip-attempt' });

    await service.resetLoginAttempts('user@example.com', '127.0.0.1');

    expect(repository.update).toHaveBeenCalledWith('email-attempt', {
      attempts: 0,
      windowStartedAt: null,
      blockedUntil: null,
    });
    expect(repository.update).toHaveBeenCalledWith('ip-attempt', {
      attempts: 0,
      windowStartedAt: null,
      blockedUntil: null,
    });
  });
});

function futureDate(): Date {
  return new Date(Date.now() + 60_000);
}
