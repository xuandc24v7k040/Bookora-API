import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import {
  AuthAttemptType,
  AuthProvider,
  Prisma,
  UserType,
} from '@/generated/prisma/client';
import { MailService } from '@/modules/mail/mail.service';
import { AuthAttemptsRepository } from '../auth-attempts.repository';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly attempts: AuthAttemptsRepository,
  ) {}

  get cooldownSeconds(): number {
    return this.config.getOrThrow<number>(
      'mail.emailVerification.resendCooldownSeconds',
    );
  }

  async resend(emailInput: string, ip: string) {
    const email = emailInput.trim().toLowerCase();
    // Separate purposes share the existing atomic attempt infrastructure.
    const results = await Promise.all([
      this.attempts.recordFailedAttemptAtomic({
        type: AuthAttemptType.EMAIL_VERIFICATION_EMAIL,
        key: email,
        maxAttempts: 2,
        lockSeconds: this.cooldownSeconds,
        windowSeconds: this.cooldownSeconds,
      }),
      this.attempts.recordFailedAttemptAtomic({
        type: AuthAttemptType.EMAIL_VERIFICATION_IP,
        key: ip,
        maxAttempts: 16,
        lockSeconds: 900,
        windowSeconds: 900,
      }),
    ]);
    if (
      results.some((row) => row.blockedUntil && row.blockedUntil > new Date())
    ) {
      throw new HttpException(
        {
          code: 'EMAIL_VERIFICATION_RATE_LIMITED',
          message: 'Vui lòng chờ trước khi yêu cầu gửi lại email xác minh.',
          retryAfterSeconds: this.cooldownSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) await this.sendForUser(user.id);
    // Neutral wording, including when delivery fails, avoids false delivery claims
    // and keeps missing/verified/Google/disabled accounts indistinguishable.
    return {
      success: true,
      message:
        'Nếu tài khoản cần xác minh, yêu cầu đã được tiếp nhận. Vui lòng kiểm tra hộp thư hoặc thử lại sau.',
      resendCooldownSeconds: this.cooldownSeconds,
    };
  }

  async sendForUser(userId: string): Promise<'SENT' | 'FAILED' | 'SKIPPED'> {
    const rawToken = randomBytes(32).toString('base64url');
    const ttlMinutes = this.config.getOrThrow<number>(
      'mail.emailVerification.ttlMinutes',
    );
    const created = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        await this.lockUser(tx, userId);
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || !this.eligible(user)) return null;
        const now = new Date();
        const latest = await tx.emailVerificationToken.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (
          latest &&
          latest.createdAt.getTime() + this.cooldownSeconds * 1000 >
            now.getTime()
        )
          return null;
        await tx.emailVerificationToken.updateMany({
          where: { userId, usedAt: null, revokedAt: null },
          data: { revokedAt: now },
        });
        const token = await tx.emailVerificationToken.create({
          data: {
            userId,
            tokenHash: this.hash(rawToken),
            createdAt: now,
            expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
          },
        });
        return { id: token.id, email: user.email };
      },
    );
    if (!created) return 'SKIPPED';
    try {
      const url = new URL(
        '/verify-email',
        this.config.getOrThrow<string>('app.frontendUrl'),
      );
      // Fragments never reach HTTP access logs or the Referer header.
      url.hash = new URLSearchParams({ token: rawToken }).toString();
      await this.mail.sendEmailVerification({
        to: created.email,
        verificationUrl: url.toString(),
        ttlMinutes,
      });
      return 'SENT';
    } catch {
      await this.prisma.emailVerificationToken.updateMany({
        where: { id: created.id, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.error('Email verification delivery failed');
      return 'FAILED';
    }
  }

  async verify(rawToken: string): Promise<{ success: true }> {
    const tokenHash = this.hash(rawToken);
    const candidate = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (!candidate) this.invalid('INVALID');
    await runSerializableTransaction(this.prisma, async (tx) => {
      // Same lock order as resend: one winner for resend/consume races.
      await this.lockUser(tx, candidate.userId);
      const token = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      const now = new Date();
      if (!token) this.invalid('INVALID');
      if (token.usedAt) this.invalid('USED');
      if (token.revokedAt) this.invalid('REVOKED');
      if (token.expiresAt <= now) this.invalid('EXPIRED');
      if (token.user.emailVerifiedAt) this.invalid('ALREADY_VERIFIED');
      if (!this.eligible(token.user)) this.invalid('REVOKED');
      const consumed = await tx.emailVerificationToken.updateMany({
        where: {
          id: token.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) this.invalid('USED');
      await tx.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: now },
      });
      await tx.emailVerificationToken.updateMany({
        where: {
          userId: token.userId,
          id: { not: token.id },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    });
    return { success: true };
  }

  private eligible(user: {
    isActive: boolean;
    type: UserType;
    provider: AuthProvider;
    emailVerificationRequired: boolean;
    emailVerifiedAt: Date | null;
  }): boolean {
    return (
      user.isActive &&
      user.type === UserType.CUSTOMER &&
      user.provider === AuthProvider.LOCAL &&
      user.emailVerificationRequired &&
      !user.emailVerifiedAt
    );
  }

  private lockUser(tx: Prisma.TransactionClient, userId: string) {
    return tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`,
    );
  }

  private hash(rawToken: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('mail.passwordReset.tokenHashSecret'),
    )
      .update('EMAIL_VERIFICATION:')
      .update(rawToken)
      .digest('hex');
  }

  private invalid(
    status: 'INVALID' | 'EXPIRED' | 'USED' | 'REVOKED' | 'ALREADY_VERIFIED',
  ): never {
    const messages = {
      INVALID: 'Liên kết xác minh email không hợp lệ.',
      EXPIRED: 'Liên kết xác minh email đã hết hạn. Vui lòng yêu cầu gửi lại.',
      USED: 'Liên kết xác minh email đã được sử dụng. Vui lòng đăng nhập hoặc yêu cầu gửi lại.',
      REVOKED:
        'Liên kết xác minh email không còn hiệu lực. Vui lòng dùng email mới nhất.',
      ALREADY_VERIFIED: 'Email đã được xác minh. Vui lòng đăng nhập.',
    };
    throw new BadRequestException({
      code: `EMAIL_VERIFICATION_${status}`,
      message: messages[status],
    });
  }
}
