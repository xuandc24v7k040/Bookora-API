import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthAttemptsRepository } from './auth-attempts.repository';
import { GoogleProfile } from './strategies/google.strategy';
import { JwtPayload } from './types/jwt-payload.type';
import { AuthenticatedUser } from './types/authenticated-user.type';
import type { UserDocument } from '../../database/schemas/users/user.schema';
import type { SignOptions } from 'jsonwebtoken';

interface CookieOptionsConfig {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'none';
  domain?: string;
  path: string;
}

interface FailedLoginResult {
  emailBlocked: boolean;
  ipBlocked: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly authAttemptsRepository: AuthAttemptsRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, response: Response) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      passwordHash,
      provider: 'local',
      role: 'user',
    });

    await this.issueSession(user, response);
    return this.toPublicUser(user);
  }

  async login(dto: LoginDto, ip: string, response: Response) {
    await Promise.all([
      this.ensureIpNotBlocked(ip),
      this.ensureEmailNotBlocked(dto.email),
    ]);
    const user = await this.usersService.findByEmail(dto.email, true);

    if (!user || user.provider !== 'local' || !user.passwordHash) {
      const failedLogin = await this.recordFailedLogin(dto.email, ip, user);
      throw this.createLoginFailureException(failedLogin);
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      this.logger.warn(`Account locked for email=${user.email}`);
      throw new UnauthorizedException(
        this.getEmailLockedMessage(user.lockUntil),
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      const failedLogin = await this.recordFailedLogin(dto.email, ip, user);
      throw this.createLoginFailureException(failedLogin);
    }

    await Promise.all([
      this.usersService.updateAuthFields(String(user._id), {
        failedLoginAttempts: 0,
        lockUntil: null,
      }),
      this.resetAttempt('email', dto.email),
      this.resetAttempt('ip', ip),
    ]);

    await this.issueSession(user, response);
    return this.toPublicUser(user);
  }

  async logout(
    userId: string | undefined,
    refreshToken: string | undefined,
    response: Response,
  ) {
    let resolvedUserId = userId;
    if (!resolvedUserId && refreshToken) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(
          refreshToken,
          {
            secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          },
        );
        resolvedUserId = payload.sub;
      } catch {
        resolvedUserId = undefined;
      }
    }

    if (resolvedUserId) {
      await this.usersService.updateAuthFields(resolvedUserId, {
        refreshTokenHash: null,
      });
    }
    this.clearAuthCookies(response);
    this.logger.log(
      `Logout completed for userId=${resolvedUserId ?? 'anonymous'}`,
    );
    return { success: true };
  }

  async refresh(refreshToken: string | undefined, response: Response) {
    if (!refreshToken) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      this.clearAuthCookies(response);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    const user = await this.usersService.findByEmail(payload.email, true);
    if (!user || !user.refreshTokenHash) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    const tokenMatches = this.matchesStoredRefreshToken(
      refreshToken,
      user.refreshTokenHash,
    );
    if (!tokenMatches) {
      await this.usersService.updateAuthFields(String(user._id), {
        refreshTokenHash: null,
      });
      this.clearAuthCookies(response);
      this.logger.warn(`Refresh token mismatch for userId=${String(user._id)}`);
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã được dùng lại',
      );
    }

    await this.issueSession(user, response);
    return { success: true };
  }

  createCsrfToken(response: Response) {
    const token = randomBytes(32).toString('hex');
    response.cookie('csrfToken', token, {
      ...this.baseCookieOptions(),
      httpOnly: false,
      maxAge: this.getRefreshMaxAge(),
    });
    return { csrfToken: token };
  }

  createOauthState(response: Response) {
    const state = randomBytes(32).toString('hex');
    response.cookie('oauthState', state, {
      ...this.baseCookieOptions(),
      signed: true,
      maxAge: 10 * 60 * 1000,
    });
    return state;
  }

  validateOauthState(cookieState: string | undefined, queryState: string) {
    return Boolean(cookieState && queryState && cookieState === queryState);
  }

  async loginWithGoogle(profile: GoogleProfile, response: Response) {
    if (!profile.email || !profile.emailVerified) {
      throw new UnauthorizedException(
        'Tài khoản Google chưa được xác minh email',
      );
    }

    let user: UserDocument | null = await this.usersService.findByEmail(
      profile.email,
      true,
    );
    if (!user) {
      user = await this.usersService.create({
        fullName: profile.fullName,
        email: profile.email.toLowerCase(),
        provider: 'google',
        googleId: profile.googleId,
        role: 'user',
      });
    } else if (user.provider === 'local') {
      user = await this.usersService.updateAuthFields(String(user._id), {
        googleId: profile.googleId,
      });
    }

    if (!user) {
      throw new UnauthorizedException('Đăng nhập Google thất bại');
    }

    await this.issueSession(user, response);
    return this.toPublicUser(user);
  }

  private async issueSession(
    user: {
      _id: unknown;
      email: string;
      role: 'user' | 'admin';
      fullName: string;
    },
    response: Response,
  ) {
    const payload: JwtPayload = {
      sub: String(user._id),
      email: user.email,
      role: user.role,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
          '15m') as SignOptions['expiresIn'],
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ??
          '7d') as SignOptions['expiresIn'],
      }),
    ]);

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    await this.usersService.updateAuthFields(String(user._id), {
      refreshTokenHash,
    });

    response.cookie('accessToken', accessToken, {
      ...this.baseCookieOptions(),
      maxAge: this.getAccessMaxAge(),
    });
    response.cookie('refreshToken', refreshToken, {
      ...this.baseCookieOptions(),
      maxAge: this.getRefreshMaxAge(),
    });
  }

  private async recordFailedLogin(
    email: string,
    ip: string,
    user: { _id: unknown; failedLoginAttempts: number } | null,
  ): Promise<FailedLoginResult> {
    this.logger.warn(`Login failed for email=${email.toLowerCase()} ip=${ip}`);
    const emailAttempt = await this.incrementAttempt('email', email);
    const ipAttempt = await this.incrementAttempt('ip', ip);
    const maxEmailAttempts = Number(
      this.configService.get<string>('AUTH_LOGIN_MAX_ATTEMPTS') ?? 5,
    );

    if (user) {
      const failedLoginAttempts = user.failedLoginAttempts + 1;
      const lockUntil =
        failedLoginAttempts >= maxEmailAttempts
          ? this.getWindowEnd()
          : undefined;
      await this.usersService.updateAuthFields(String(user._id), {
        failedLoginAttempts,
        lockUntil,
      });
      if (lockUntil) {
        this.logger.warn(`Account locked for userId=${String(user._id)}`);
      }
    }

    if (emailAttempt?.blockedUntil || ipAttempt?.blockedUntil) {
      this.logger.warn(
        `Auth attempt blocked email=${email.toLowerCase()} ip=${ip}`,
      );
    }

    return {
      emailBlocked: Boolean(emailAttempt?.blockedUntil),
      ipBlocked: Boolean(ipAttempt?.blockedUntil),
    };
  }

  private async ensureIpNotBlocked(ip: string) {
    const attempt = await this.authAttemptsRepository.findOne({
      type: 'ip',
      key: ip.toLowerCase(),
    });
    if (attempt?.blockedUntil && attempt.blockedUntil > new Date()) {
      throw new UnauthorizedException(
        this.getIpBlockedMessage(attempt.blockedUntil),
      );
    }
  }

  private async ensureEmailNotBlocked(email: string) {
    const attempt = await this.authAttemptsRepository.findOne({
      type: 'email',
      key: email.toLowerCase(),
    });
    if (attempt?.blockedUntil && attempt.blockedUntil > new Date()) {
      throw new UnauthorizedException(
        this.getEmailLockedMessage(attempt.blockedUntil),
      );
    }
  }

  private async incrementAttempt(type: 'email' | 'ip', key: string) {
    const normalizedKey = key.toLowerCase();
    const existing = await this.authAttemptsRepository.findOne({
      type,
      key: normalizedKey,
    });
    const now = new Date();
    const expired =
      !existing || existing.windowStartedAt < this.getWindowStart();
    const attempts = expired ? 1 : existing.attempts + 1;
    const maxAttempts =
      type === 'email'
        ? Number(this.configService.get<string>('AUTH_LOGIN_MAX_ATTEMPTS') ?? 5)
        : Number(this.configService.get<string>('AUTH_IP_MAX_ATTEMPTS') ?? 5);
    const blockedUntil = attempts >= maxAttempts ? this.getWindowEnd() : null;

    if (!existing) {
      return this.authAttemptsRepository.create({
        type,
        key: normalizedKey,
        attempts,
        windowStartedAt: now,
        blockedUntil,
      });
    }

    return this.authAttemptsRepository.findOneAndUpdate(
      { _id: existing._id },
      {
        attempts,
        windowStartedAt: expired ? now : existing.windowStartedAt,
        blockedUntil,
      },
    );
  }

  private resetAttempt(type: 'email' | 'ip', key: string) {
    return this.authAttemptsRepository.findOneAndUpdate(
      { type, key: key.toLowerCase() },
      { attempts: 0, blockedUntil: null, windowStartedAt: new Date() },
    );
  }

  private clearAuthCookies(response: Response) {
    const options = this.baseCookieOptions();
    response.clearCookie('accessToken', options);
    response.clearCookie('refreshToken', options);
    response.clearCookie('csrfToken', { ...options, httpOnly: false });
    response.clearCookie('oauthState', options);
  }

  private toPublicUser(user: {
    _id: unknown;
    email: string;
    fullName: string;
    role: 'user' | 'admin';
  }): AuthenticatedUser {
    return {
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }

  private baseCookieOptions(): CookieOptionsConfig {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const frontendUrl = this.configService.get<string>('app.frontendUrl') ?? '';
    const backendDomain = this.configService.get<string>('COOKIE_DOMAIN');
    const frontendHost = frontendUrl ? new URL(frontendUrl).host : '';
    const crossSite = Boolean(
      backendDomain && frontendHost && !frontendHost.includes(backendDomain),
    );

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction && crossSite ? 'none' : 'lax',
      domain: backendDomain || undefined,
      path: '/',
    };
  }

  private getAccessMaxAge() {
    return this.parseDuration(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    );
  }

  private getRefreshMaxAge() {
    return this.parseDuration(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    );
  }

  private parseDuration(value: string) {
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 15 * 60 * 1000;
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return amount * multipliers[unit];
  }

  private getWindowStart() {
    return new Date(Date.now() - this.getWindowMs());
  }

  private getWindowEnd() {
    return new Date(Date.now() + this.getWindowMs());
  }

  private getWindowMs() {
    const minutes = Number(
      this.configService.get<string>('AUTH_LOCK_WINDOW_MINUTES') ?? 1,
    );
    return minutes * 60 * 1000;
  }

  private createLoginFailureException(result: FailedLoginResult) {
    if (result.emailBlocked) {
      return new UnauthorizedException(
        this.getEmailLockedMessage(this.getWindowEnd()),
      );
    }

    if (result.ipBlocked) {
      return new UnauthorizedException(
        this.getIpBlockedMessage(this.getWindowEnd()),
      );
    }

    return new UnauthorizedException(this.getInvalidCredentialsMessage());
  }

  private getInvalidCredentialsMessage() {
    return 'Email hoặc mật khẩu không đúng';
  }

  private getEmailLockedMessage(lockUntil: Date) {
    if (!this.isDevelopment()) {
      return this.getInvalidCredentialsMessage();
    }

    return `Tài khoản đã bị khóa ${this.getWindowMinutes()} phút, thử lại sau ${this.formatRetryAt(lockUntil)}.`;
  }

  private getIpBlockedMessage(blockedUntil: Date) {
    if (!this.isDevelopment()) {
      return this.getInvalidCredentialsMessage();
    }

    return `IP đã bị chặn ${this.getWindowMinutes()} phút, thử lại sau ${this.formatRetryAt(blockedUntil)}.`;
  }

  private isDevelopment() {
    return this.configService.get<string>('NODE_ENV') !== 'production';
  }

  private getWindowMinutes() {
    return Number(
      this.configService.get<string>('AUTH_LOCK_WINDOW_MINUTES') ?? 1,
    );
  }

  private formatRetryAt(date: Date) {
    return date.toLocaleString('vi-VN', {
      hour12: false,
    });
  }

  // JWT refresh tokens are long and share a common prefix, so bcrypt's
  // 72-byte truncation rule is unsafe here. Store a full-length digest instead.
  private hashRefreshToken(refreshToken: string) {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private matchesStoredRefreshToken(refreshToken: string, storedHash: string) {
    if (!/^[a-f0-9]{64}$/i.test(storedHash)) {
      return false;
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    const left = Buffer.from(tokenHash, 'hex');
    const right = Buffer.from(storedHash, 'hex');

    return left.length === right.length && timingSafeEqual(left, right);
  }
}
