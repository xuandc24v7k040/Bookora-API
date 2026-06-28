import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

    await expect(
      service.verifyToken(undefined, '127.0.0.1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects missing token when Turnstile is enabled', async () => {
    mockConfig({ enabled: true });

    await expect(service.verifyToken(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
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

    await expect(service.verifyToken('invalid-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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

    await expect(service.verifyToken('token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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

    await expect(
      service.verifyToken('token', '127.0.0.1', 'login'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects malformed responses', async () => {
    mockConfig();
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ hostname: 'bookora.local' }),
    });

    await expect(service.verifyToken('token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects network errors', async () => {
    mockConfig();
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(service.verifyToken('token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
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

    const verification = expect(
      service.verifyToken('token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await jest.advanceTimersByTimeAsync(25);

    await verification;
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

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
