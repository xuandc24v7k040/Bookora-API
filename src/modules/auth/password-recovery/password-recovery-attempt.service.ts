import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthAttemptType } from '@/generated/prisma/client';
import { AuthAttemptsRepository } from '../auth-attempts.repository';
import { PASSWORD_RECOVERY_ERROR_CODES } from './password-recovery-error-codes';

interface AttemptPolicy {
  type: AuthAttemptType;
  maxAttempts: number;
  lockSeconds: number;
}

@Injectable()
export class PasswordRecoveryAttemptService {
  constructor(
    private readonly repository: AuthAttemptsRepository,
    private readonly configService: ConfigService,
  ) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async consume(email: string, ip: string): Promise<void> {
    const policies = this.policies(email, ip);
    const existing = await Promise.all(
      policies.map(({ type, key }) => this.repository.findOne(type, key)),
    );
    const now = new Date();

    if (
      existing.some(
        (attempt) => attempt?.blockedUntil && attempt.blockedUntil > now,
      )
    ) {
      this.throwRateLimited();
    }

    const windowSeconds =
      this.configService.get<number>(
        'auth.passwordRecovery.attemptWindowSeconds',
      ) ?? 900;
    const results = await Promise.all(
      policies.map((policy) =>
        this.repository.recordFailedAttemptAtomic({
          ...policy,
          windowSeconds,
        }),
      ),
    );

    if (
      results.some(
        (attempt) => attempt.blockedUntil && attempt.blockedUntil > new Date(),
      )
    ) {
      this.throwRateLimited();
    }
  }

  private policies(email: string, ip: string) {
    return [
      {
        type: AuthAttemptType.PASSWORD_RESET_EMAIL,
        key: email,
        maxAttempts:
          this.configService.get<number>(
            'auth.passwordRecovery.emailMaxAttempts',
          ) ?? 5,
        lockSeconds:
          this.configService.get<number>(
            'auth.passwordRecovery.emailLockSeconds',
          ) ?? 900,
      },
      {
        type: AuthAttemptType.PASSWORD_RESET_IP,
        key: ip,
        maxAttempts:
          this.configService.get<number>(
            'auth.passwordRecovery.ipMaxAttempts',
          ) ?? 15,
        lockSeconds:
          this.configService.get<number>(
            'auth.passwordRecovery.ipLockSeconds',
          ) ?? 900,
      },
    ] satisfies Array<AttemptPolicy & { key: string }>;
  }

  private throwRateLimited(): never {
    throw new HttpException(
      {
        code: PASSWORD_RECOVERY_ERROR_CODES.rateLimited,
        message: 'Có quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
