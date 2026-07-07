import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_ERROR_CODES } from './auth-error-codes';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  const fetchMock = jest.fn();
  const config = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  let service: TurnstileService;

  beforeEach(() => {
    fetchMock.mockReset();
    config.get.mockReset();
    config.getOrThrow.mockReset();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    global.fetch = fetchMock;
    service = new TurnstileService(config as unknown as ConfigService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('skips verification when Turnstile is disabled outside production', async () => {
    mockConfig({ enabled: false, nodeEnv: 'test' });

    await expect(
      service.verifyToken(undefined, '127.0.0.1'),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects production bypass when Turnstile is disabled', async () => {
    mockConfig({ enabled: false, nodeEnv: 'production' });

    await expectTurnstileFailure(service.verifyToken(undefined, '127.0.0.1'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects missing token when Turnstile is enabled', async () => {
    mockConfig({ enabled: true });

    let error: BadRequestException | undefined;
    try {
      await service.verifyToken(undefined);
    } catch (caught) {
      error = caught as BadRequestException;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error?.getStatus()).toBe(400);
    expect(error?.getResponse()).toMatchObject({
      message: 'Xác minh bảo mật thất bại, vui lòng thử lại.',
      code: AUTH_ERROR_CODES.turnstileRequired,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a valid Turnstile response', async () => {
    mockConfig({
      expectedHostnames: ['bookora.local'],
      expectedLoginAction: 'login',
    });
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          hostname: 'bookora.local',
          action: 'login',
        }),
    });

    await expect(
      service.verifyToken('valid-token', '127.0.0.1', 'login'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/siteverify',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('rejects success=false without exposing Cloudflare details', async () => {
    mockConfig();
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
    });

    await expectTurnstileFailure(service.verifyToken('invalid-token'));
  });

  it('rejects hostname mismatch', async () => {
    mockConfig({ expectedHostnames: ['bookora.local'] });
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          hostname: 'evil.example',
        }),
    });

    await expectTurnstileFailure(service.verifyToken('token'));
  });

  it('rejects action mismatch', async () => {
    mockConfig({ expectedLoginAction: 'login' });
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          action: 'register',
        }),
    });

    await expectTurnstileFailure(
      service.verifyToken('token', '127.0.0.1', 'login'),
    );
  });

  it('rejects malformed responses', async () => {
    mockConfig();
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ hostname: 'bookora.local' }),
    });

    await expectTurnstileFailure(service.verifyToken('token'));
  });

  it('rejects network errors', async () => {
    mockConfig();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expectTurnstileFailure(service.verifyToken('token'));
  });

  it('aborts timeout requests and cleans up the timer', async () => {
    jest.useFakeTimers();
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    mockConfig({ timeoutMs: 25 });
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    const verification = expectTurnstileFailure(service.verifyToken('token'));
    await jest.advanceTimersByTimeAsync(25);

    await verification;
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  async function expectTurnstileFailure(promise: Promise<void>) {
    let error: ForbiddenException | undefined;
    try {
      await promise;
    } catch (caught) {
      error = caught as ForbiddenException;
    }

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error?.getStatus()).toBe(403);
    expect(error?.getResponse()).toMatchObject({
      message: 'Xác minh bảo mật thất bại, vui lòng thử lại.',
      code: AUTH_ERROR_CODES.turnstileFailed,
    });
  }

  function mockConfig(options?: {
    enabled?: boolean;
    nodeEnv?: string;
    expectedHostnames?: string[];
    expectedLoginAction?: string;
    expectedRegisterAction?: string;
    timeoutMs?: number;
  }) {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        'auth.turnstile.enabled': options?.enabled ?? true,
        'environment.nodeEnv': options?.nodeEnv ?? 'test',
        'auth.turnstile.secretKey': 'secret',
        'auth.turnstile.expectedHostnames': options?.expectedHostnames ?? [],
        'auth.turnstile.expectedActions.login':
          options?.expectedLoginAction ?? 'login',
        'auth.turnstile.expectedActions.register':
          options?.expectedRegisterAction ?? 'register',
        'auth.turnstile.timeoutMs': options?.timeoutMs ?? 3000,
      };
      return values[key];
    });
    config.getOrThrow.mockImplementation((key: string) => {
      if (key === 'auth.turnstile.siteverifyUrl') {
        return 'https://example.com/siteverify';
      }
      return undefined;
    });
  }
});
