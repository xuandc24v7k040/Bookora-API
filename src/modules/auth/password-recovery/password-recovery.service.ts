import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthProvider,
  UserType,
  type PasswordResetToken,
  type User,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { MailService } from '@/modules/mail/mail.service';
import type { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes } from 'crypto';
import { AuthService } from '../auth.service';
import { AuthSessionsRepository } from '../auth-sessions.repository';
import { PasswordRecoveryAttemptService } from './password-recovery-attempt.service';
import {
  PASSWORD_RECOVERY_ERROR_CODES,
  type PasswordResetTokenStatus,
} from './password-recovery-error-codes';
import { PasswordResetTokensRepository } from './password-reset-tokens.repository';

const GENERIC_RESPONSE = {
  success: true,
  message:
    'Nếu email tồn tại trong hệ thống, Bookora đã gửi hướng dẫn đặt lại mật khẩu.',
} as const;

type ResetTokenWithUser = PasswordResetToken & { user: User };

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    private readonly tokens: PasswordResetTokensRepository,
    private readonly attempts: PasswordRecoveryAttemptService,
    private readonly authSessions: AuthSessionsRepository,
    private readonly authService: AuthService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async forgotPassword(emailInput: string, ip: string) {
    const email = this.attempts.normalizeEmail(emailInput);
    await this.attempts.consume(email, ip);
    const user = await this.tokens.findUserByEmail(email);

    if (!user) {
      throw new NotFoundException({
        code: PASSWORD_RECOVERY_ERROR_CODES.emailNotFound,
        message: 'Email này chưa được đăng ký trong hệ thống.',
      });
    }

    if (!user.isActive || user.type !== UserType.CUSTOMER) {
      return GENERIC_RESPONSE;
    }

    if (user.provider === AuthProvider.GOOGLE) {
      throw new BadRequestException({
        code: PASSWORD_RECOVERY_ERROR_CODES.googleProviderUnsupported,
        message:
          'Tài khoản này đăng nhập bằng Google và không sử dụng mật khẩu Bookora. Vui lòng quay lại trang đăng nhập và chọn “Đăng nhập bằng Google”.',
      });
    }

    if (user.provider !== AuthProvider.LOCAL || !user.passwordHash) {
      return GENERIC_RESPONSE;
    }

    const rawToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const ttlMinutes = this.configService.getOrThrow<number>(
      'mail.passwordReset.ttlMinutes',
    );
    const created = await this.tokens.createReplacingActive({
      userId: user.id,
      tokenHash: this.hashToken(rawToken),
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
      now,
    });

    try {
      await this.mailService.sendPasswordReset({
        to: user.email,
        resetUrl: this.createResetUrl(rawToken),
        ttlMinutes,
      });
    } catch {
      await this.tokens.revokeIfActive(created.id, new Date());
      this.logger.error('Password reset email delivery failed provider=resend');
    }

    return GENERIC_RESPONSE;
  }

  async validateToken(rawToken: string): Promise<{ status: 'VALID' }> {
    const token = await this.tokens.findByHash(this.hashToken(rawToken));
    const status = this.statusOf(token, new Date());
    if (status !== 'VALID') {
      this.throwForStatus(status);
    }
    return { status: 'VALID' };
  }

  async resetPassword(
    rawToken: string,
    newPassword: string,
    response: Response,
  ) {
    const token = await this.tokens.findByHash(this.hashToken(rawToken));
    const status = this.statusOf(token, new Date());
    if (status !== 'VALID' || !token) {
      this.throwForStatus(status);
    }

    if (await bcrypt.compare(newPassword, token.user.passwordHash!)) {
      throw new BadRequestException({
        code: PASSWORD_RECOVERY_ERROR_CODES.sameAsCurrent,
        message: 'Mật khẩu mới không được trùng mật khẩu hiện tại',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    try {
      await runSerializableTransaction(this.prisma, async (tx) => {
        const consumed = await tx.passwordResetToken.updateMany({
          where: {
            id: token.id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) {
          this.throwConflict();
        }

        const userUpdated = await tx.user.updateMany({
          where: {
            id: token.userId,
            type: UserType.CUSTOMER,
            provider: AuthProvider.LOCAL,
            isActive: true,
            passwordHash: token.user.passwordHash,
          },
          data: { passwordHash },
        });
        if (userUpdated.count !== 1) {
          this.throwConflict();
        }

        await this.authSessions.revokeActiveByUserId(token.userId, tx, now);
        await tx.passwordResetToken.updateMany({
          where: {
            userId: token.userId,
            id: { not: token.id },
            usedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      });
    } catch (error) {
      if (
        error instanceof ConflictException &&
        !this.isPasswordResetConflict(error)
      ) {
        this.throwConflict();
      }
      throw error;
    }

    this.authService.clearAuthCookies(response);
    return { success: true };
  }

  private statusOf(
    token: ResetTokenWithUser | null,
    now: Date,
  ): PasswordResetTokenStatus {
    if (!token) return 'INVALID';
    if (token.usedAt) return 'USED';
    if (token.revokedAt) return 'REVOKED';
    if (token.expiresAt <= now) return 'EXPIRED';
    if (
      !token.user.isActive ||
      token.user.type !== UserType.CUSTOMER ||
      token.user.provider !== AuthProvider.LOCAL ||
      !token.user.passwordHash
    ) {
      return 'REVOKED';
    }
    return 'VALID';
  }

  private throwForStatus(status: PasswordResetTokenStatus): never {
    const errorByStatus = {
      INVALID: [
        PASSWORD_RECOVERY_ERROR_CODES.invalidToken,
        'Liên kết đặt lại mật khẩu không hợp lệ.',
      ],
      EXPIRED: [
        PASSWORD_RECOVERY_ERROR_CODES.expiredToken,
        'Liên kết đặt lại mật khẩu đã hết hạn.',
      ],
      USED: [
        PASSWORD_RECOVERY_ERROR_CODES.usedToken,
        'Liên kết này đã được sử dụng.',
      ],
      REVOKED: [
        PASSWORD_RECOVERY_ERROR_CODES.revokedToken,
        'Liên kết này không còn hiệu lực.',
      ],
      VALID: [
        PASSWORD_RECOVERY_ERROR_CODES.invalidToken,
        'Liên kết đặt lại mật khẩu không hợp lệ.',
      ],
    } as const;
    const [code, message] = errorByStatus[status];
    throw new BadRequestException({ code, message });
  }

  private throwConflict(): never {
    throw new ConflictException({
      code: PASSWORD_RECOVERY_ERROR_CODES.tokenConflict,
      message: 'Liên kết đặt lại mật khẩu đã hết hạn hoặc không còn hiệu lực.',
    });
  }

  private isPasswordResetConflict(error: ConflictException): boolean {
    const response = error.getResponse();
    return (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      response.code === PASSWORD_RECOVERY_ERROR_CODES.tokenConflict
    );
  }

  private hashToken(rawToken: string): string {
    return createHmac(
      'sha256',
      this.configService.getOrThrow<string>(
        'mail.passwordReset.tokenHashSecret',
      ),
    )
      .update(rawToken)
      .digest('hex');
  }

  private createResetUrl(rawToken: string): string {
    const resetUrl = new URL(
      '/reset-password',
      this.configService.getOrThrow<string>('app.frontendUrl'),
    );
    resetUrl.searchParams.set('token', rawToken);
    return resetUrl.toString();
  }
}
