import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthAttemptType } from '@/generated/prisma/client';
import { AuthAttemptsRepository } from './auth-attempts.repository';

interface AttemptLimitConfig {
  maxAttempts: number;
  lockSeconds: number;
}

interface FailedAttemptResult {
  blocked: boolean;
}

@Injectable()
export class AuthAttemptService {
  constructor(
    private readonly authAttemptsRepository: AuthAttemptsRepository,
    private readonly configService: ConfigService,
  ) {}

  normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  async checkLoginBlocked(email: string, ip: string) {
    await this.throwIfIpBlocked(ip);

    if (!(await this.isBlocked(AuthAttemptType.EMAIL, email))) {
      return;
    }

    const ipResult = await this.recordIpFailure(ip);
    if (ipResult.blocked) {
      this.throwIpBlocked();
    }

    this.throwEmailBlocked();
  }

  async recordLoginFailure(email: string, ip: string) {
    const [emailResult, ipResult] = await Promise.all([
      this.recordFailedAttempt(AuthAttemptType.EMAIL, email, {
        maxAttempts:
          this.configService.get<number>('auth.login.emailMaxFailedAttempts') ??
          5,
        lockSeconds:
          this.configService.get<number>('auth.login.emailLockSeconds') ?? 60,
      }),
      this.recordIpFailure(ip),
    ]);

    if (ipResult.blocked) {
      this.throwIpBlocked();
    }

    if (emailResult.blocked) {
      this.throwEmailBlocked();
    }
  }

  async resetLoginAttempts(email: string, ip: string) {
    await Promise.all([
      this.resetAttempt(AuthAttemptType.EMAIL, email),
      this.resetAttempt(AuthAttemptType.IP, ip),
    ]);
  }

  private async throwIfIpBlocked(ip: string) {
    if (await this.isBlocked(AuthAttemptType.IP, ip)) {
      this.throwIpBlocked();
    }
  }

  private async isBlocked(type: AuthAttemptType, key: string) {
    const attempt = await this.authAttemptsRepository.findOne(type, key);
    return Boolean(attempt?.blockedUntil && attempt.blockedUntil > new Date());
  }

  private recordIpFailure(ip: string) {
    return this.recordFailedAttempt(AuthAttemptType.IP, ip, {
      maxAttempts:
        this.configService.get<number>('auth.login.ipMaxFailedAttempts') ?? 10,
      lockSeconds:
        this.configService.get<number>('auth.login.ipLockSeconds') ?? 120,
    });
  }

  private async recordFailedAttempt(
    type: AuthAttemptType,
    key: string,
    limitConfig: AttemptLimitConfig,
  ): Promise<FailedAttemptResult> {
    const now = new Date();
    const attempt = await this.authAttemptsRepository.findOne(type, key);

    if (attempt?.blockedUntil && attempt.blockedUntil > now) {
      return { blocked: true };
    }

    const windowStartedAt = this.shouldStartNewWindow(attempt, now)
      ? now
      : attempt?.windowStartedAt;
    const attempts = windowStartedAt === now ? 1 : (attempt?.attempts ?? 0) + 1;
    const blockedUntil =
      attempts >= limitConfig.maxAttempts
        ? new Date(now.getTime() + limitConfig.lockSeconds * 1000)
        : null;

    if (!attempt) {
      await this.authAttemptsRepository.create({
        type,
        key,
        attempts,
        windowStartedAt,
        blockedUntil,
      });
    } else {
      await this.authAttemptsRepository.update(attempt.id, {
        attempts,
        windowStartedAt,
        blockedUntil,
      });
    }

    return { blocked: Boolean(blockedUntil) };
  }

  private async resetAttempt(type: AuthAttemptType, key: string) {
    const attempt = await this.authAttemptsRepository.findOne(type, key);
    if (!attempt) {
      return;
    }

    await this.authAttemptsRepository.update(attempt.id, {
      attempts: 0,
      windowStartedAt: null,
      blockedUntil: null,
    });
  }

  private shouldStartNewWindow(
    attempt: Awaited<ReturnType<AuthAttemptsRepository['findOne']>>,
    now: Date,
  ) {
    if (!attempt?.windowStartedAt) {
      return true;
    }

    if (attempt.blockedUntil && attempt.blockedUntil <= now) {
      return true;
    }

    const windowSeconds =
      this.configService.get<number>('auth.login.attemptWindowSeconds') ?? 60;
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);

    return attempt.windowStartedAt < windowStart;
  }

  private throwEmailBlocked(): never {
    throw new HttpException(
      `Tài khoản tạm thời bị khóa, vui lòng thử lại sau ${this.getLockMinutes('auth.login.emailLockSeconds', 60)} phút.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private throwIpBlocked(): never {
    throw new HttpException(
      `IP tạm thời bị chặn do quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau ${this.getLockMinutes('auth.login.ipLockSeconds', 120)} phút.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getLockMinutes(configKey: string, fallbackSeconds: number) {
    const seconds =
      this.configService.get<number>(configKey) ?? fallbackSeconds;
    return Math.ceil(seconds / 60);
  }
}
