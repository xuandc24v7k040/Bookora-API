import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthAttemptType } from '@/generated/prisma/client';
import { AuthAttemptsRepository } from './auth-attempts.repository';

interface AttemptLimitConfig {
  maxAttempts: number;
  lockSeconds: number;
}

interface FailedAttemptResult {
  blocked: boolean;
  blockedUntil: Date | null;
}

const GENERIC_LOGIN_RESTRICTED_MESSAGE =
  'Thông tin đăng nhập không hợp lệ hoặc yêu cầu tạm thời bị hạn chế. Vui lòng thử lại sau.';

export class EmailLoginRestrictedException extends HttpException {
  constructor() {
    super(GENERIC_LOGIN_RESTRICTED_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class AuthAttemptService {
  private readonly logger = new Logger(AuthAttemptService.name);

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
      this.logger.warn(
        `Login blocked by IP failure threshold: email=${email}, ip=${ip}, blockedUntil=${ipResult.blockedUntil?.toISOString() ?? 'unknown'}`,
      );
      this.throwIpBlocked();
    }

    this.logger.warn(
      `Login blocked by active email lock: email=${email}, ip=${ip}`,
    );
    this.throwGenericLoginRestricted();
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
      this.logger.warn(
        `Login blocked by IP failure threshold: email=${email}, ip=${ip}, blockedUntil=${ipResult.blockedUntil?.toISOString() ?? 'unknown'}`,
      );
      this.throwIpBlocked();
    }

    if (emailResult.blocked) {
      this.logger.warn(
        `Login blocked by email failure threshold: email=${email}, ip=${ip}, blockedUntil=${emailResult.blockedUntil?.toISOString() ?? 'unknown'}`,
      );
      this.throwGenericLoginRestricted();
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
      this.logger.warn(`Login blocked by active IP lock: ip=${ip}`);
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
    const attemptWindowSeconds =
      this.configService.get<number>('auth.login.attemptWindowSeconds') ?? 60;
    const result = await this.authAttemptsRepository.recordFailedAttemptAtomic({
      type,
      key,
      maxAttempts: limitConfig.maxAttempts,
      lockSeconds: limitConfig.lockSeconds,
      windowSeconds: attemptWindowSeconds,
    });

    return {
      blocked: Boolean(result.blockedUntil && result.blockedUntil > new Date()),
      blockedUntil: result.blockedUntil,
    };
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

  private throwGenericLoginRestricted(): never {
    throw new EmailLoginRestrictedException();
  }

  private throwIpBlocked(): never {
    throw new HttpException(
      `Yêu cầu đăng nhập tạm thời bị hạn chế. Vui lòng thử lại sau ${this.getLockMinutes('auth.login.ipLockSeconds', 120)} phút.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getLockMinutes(configKey: string, fallbackSeconds: number) {
    const seconds =
      this.configService.get<number>(configKey) ?? fallbackSeconds;
    return Math.ceil(seconds / 60);
  }
}
