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
    jest.restoreAllMocks();
  });

  it('skips verification when Turnstile is disabled', async () => {
    config.get.mockReturnValue(false);

    await expect(
      service.verifyToken(undefined, '127.0.0.1'),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects missing token when Turnstile is enabled', async () => {
    config.get.mockReturnValue(true);

    await expect(service.verifyToken(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid token without exposing Cloudflare response', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'auth.turnstile.enabled') {
        return true;
      }

      if (key === 'auth.turnstile.secretKey') {
        return 'secret';
      }

      return undefined;
    });
    config.getOrThrow.mockReturnValue('https://example.com/siteverify');
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

  it('passes valid token to Cloudflare siteverify', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'auth.turnstile.enabled') {
        return true;
      }

      if (key === 'auth.turnstile.secretKey') {
        return 'secret';
      }

      return undefined;
    });
    config.getOrThrow.mockReturnValue('https://example.com/siteverify');
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    await expect(
      service.verifyToken('valid-token', '127.0.0.1'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/siteverify',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams),
      }),
    );
  });
});
