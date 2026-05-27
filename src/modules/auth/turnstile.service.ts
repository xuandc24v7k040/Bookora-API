import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TURNSTILE_FAILED_MESSAGE = 'Xác minh bảo mật thất bại, vui lòng thử lại.';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly configService: ConfigService) {}

  async verifyToken(
    token: string | undefined,
    remoteIp?: string,
  ): Promise<void> {
    if (!this.configService.get<boolean>('auth.turnstile.enabled')) {
      return;
    }

    if (!token) {
      throw new BadRequestException(TURNSTILE_FAILED_MESSAGE);
    }

    const secret = this.configService.get<string>('auth.turnstile.secretKey');
    const siteverifyUrl = this.configService.getOrThrow<string>(
      'auth.turnstile.siteverifyUrl',
    );

    if (!secret) {
      this.logger.error('Turnstile secret key is not configured');
      throw new ForbiddenException(TURNSTILE_FAILED_MESSAGE);
    }

    const body = new URLSearchParams({
      secret,
      response: token,
    });

    if (remoteIp && remoteIp !== 'unknown') {
      body.set('remoteip', remoteIp);
    }

    let verification: TurnstileVerifyResponse;
    try {
      const response = await fetch(siteverifyUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      verification = (await response.json()) as TurnstileVerifyResponse;
    } catch (error) {
      this.logger.warn(
        `Turnstile verification request failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new ForbiddenException(TURNSTILE_FAILED_MESSAGE);
    }

    if (!verification.success) {
      this.logger.warn(
        `Turnstile verification failed: ${
          verification['error-codes']?.join(', ') ?? 'unknown'
        }`,
      );
      throw new ForbiddenException(TURNSTILE_FAILED_MESSAGE);
    }
  }
}
