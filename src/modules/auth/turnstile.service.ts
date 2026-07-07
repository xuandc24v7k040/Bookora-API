import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUTH_ERROR_CODES } from './auth-error-codes';

const TURNSTILE_FAILED_MESSAGE = 'Xác minh bảo mật thất bại, vui lòng thử lại.';

interface TurnstileVerifyResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

type TurnstileAction = 'login' | 'register';

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly configService: ConfigService) {}

  async verifyToken(
    token: string | undefined,
    remoteIp?: string,
    action?: TurnstileAction,
  ): Promise<void> {
    if (!this.configService.get<boolean>('auth.turnstile.enabled')) {
      this.assertBypassAllowed();
      return;
    }

    if (!token) {
      throw new BadRequestException({
        message: TURNSTILE_FAILED_MESSAGE,
        code: AUTH_ERROR_CODES.turnstileRequired,
      });
    }

    const secret = this.configService.get<string>('auth.turnstile.secretKey');
    const siteverifyUrl = this.configService.getOrThrow<string>(
      'auth.turnstile.siteverifyUrl',
    );

    if (!secret) {
      this.logger.error('Turnstile secret key is not configured');
      throw this.createFailedException();
    }

    const body = new URLSearchParams({
      secret,
      response: token,
    });

    if (remoteIp && remoteIp !== 'unknown') {
      body.set('remoteip', remoteIp);
    }

    const verification = await this.requestVerification(siteverifyUrl, body);
    if (!this.isValidVerificationResponse(verification)) {
      this.logger.warn('Turnstile returned a malformed response');
      throw this.createFailedException();
    }

    if (!verification.success) {
      this.logger.warn(
        `Turnstile verification failed: ${
          verification['error-codes']?.join(', ') ?? 'unknown'
        }`,
      );
      throw this.createFailedException();
    }

    this.assertExpectedHostname(verification.hostname);
    this.assertExpectedAction(verification.action, action);
  }

  private assertBypassAllowed() {
    if (
      this.configService.get<string>('environment.nodeEnv') === 'production'
    ) {
      this.logger.error('Turnstile bypass is not allowed in production');
      throw this.createFailedException();
    }
  }

  private async requestVerification(
    siteverifyUrl: string,
    body: URLSearchParams,
  ): Promise<unknown> {
    const timeoutMs =
      this.configService.get<number>('auth.turnstile.timeoutMs') ?? 3000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(siteverifyUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: controller.signal,
      });

      return await response.json();
    } catch (error) {
      this.logger.warn(
        `Turnstile verification request failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw this.createFailedException();
    } finally {
      clearTimeout(timeout);
    }
  }

  private isValidVerificationResponse(
    value: unknown,
  ): value is TurnstileVerifyResponse {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as TurnstileVerifyResponse).success === 'boolean'
    );
  }

  private assertExpectedHostname(hostname: string | undefined) {
    const expectedHostnames =
      this.configService.get<string[]>('auth.turnstile.expectedHostnames') ??
      [];
    if (expectedHostnames.length === 0) {
      return;
    }

    const normalizedHostname = hostname?.trim().toLowerCase();
    if (
      !normalizedHostname ||
      !expectedHostnames.includes(normalizedHostname)
    ) {
      this.logger.warn(
        `Turnstile hostname mismatch: ${normalizedHostname ?? 'missing'}`,
      );
      throw this.createFailedException();
    }
  }

  private assertExpectedAction(
    action: string | undefined,
    expectedActionKey: TurnstileAction | undefined,
  ) {
    if (!expectedActionKey) {
      return;
    }

    const expectedAction = this.configService.get<string>(
      `auth.turnstile.expectedActions.${expectedActionKey}`,
    );
    if (!expectedAction) {
      return;
    }

    if (action !== expectedAction) {
      this.logger.warn(
        `Turnstile action mismatch: expected=${expectedAction}, actual=${
          action ?? 'missing'
        }`,
      );
      throw this.createFailedException();
    }
  }

  private createFailedException() {
    return new ForbiddenException({
      message: TURNSTILE_FAILED_MESSAGE,
      code: AUTH_ERROR_CODES.turnstileFailed,
    });
  }
}
