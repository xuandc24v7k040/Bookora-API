import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuthProvider,
  Prisma,
  type User,
  type UserType,
} from '@/generated/prisma/client';
import { parseDuration, timingSafeTokenEqual } from '@/common/utils';
import type { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { PrismaService } from '@/database/prisma.service';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import {
  AuthAttemptService,
  EmailLoginRestrictedException,
} from './auth-attempt.service';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleProfile } from './strategies/google.strategy';
import { JwtPayload } from './types/jwt-payload.type';

interface CookieOptionsConfig {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'none';
  domain?: string;
  path: string;
}

interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PublicAuthUser {
  id: string;
  email: string;
  fullName: string;
  type: UserType;
}

const INVALID_CREDENTIALS_MESSAGE =
  'Thông tin đăng nhập không hợp lệ hoặc yêu cầu tạm thời bị hạn chế. Vui lòng thử lại sau.';
const INVALID_SESSION_MESSAGE = 'Phiên đăng nhập không hợp lệ';
const REFRESH_TOKEN_INVALID_OR_REUSED = 'REFRESH_TOKEN_INVALID_OR_REUSED';
const REFRESH_TOKEN_ALREADY_ROTATED = 'REFRESH_TOKEN_ALREADY_ROTATED';
const DUMMY_PASSWORD_HASH =
  '$2b$12$W4eNCct48uDkK9PWEV4k3eVArX1fpyxnrBK9KvJx.Ih8HFueC8Z3q';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authAttemptService: AuthAttemptService,
    private readonly authSessionsRepository: AuthSessionsRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.authAttemptService.normalizeEmail(dto.email);
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.createCustomerForAuth({
      fullName: dto.fullName,
      email,
      passwordHash,
      provider: AuthProvider.LOCAL,
    });

    return this.toPublicUser(user);
  }

  async login(dto: LoginDto, metadata: RequestMetadata, response: Response) {
    const email = this.authAttemptService.normalizeEmail(dto.email);
    const ip = metadata.ipAddress ?? 'unknown';

    try {
      await this.authAttemptService.checkLoginBlocked(email, ip);
    } catch (error) {
      if (error instanceof EmailLoginRestrictedException) {
        await bcrypt.compare(dto.password, DUMMY_PASSWORD_HASH);
      }
      throw error;
    }
    const user = await this.usersService.findByEmail(email, true);
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordValid = await bcrypt.compare(dto.password, passwordHash);

    if (
      !user ||
      !user.isActive ||
      user.provider !== AuthProvider.LOCAL ||
      !user.passwordHash ||
      !passwordValid
    ) {
      await this.authAttemptService.recordLoginFailure(email, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    await this.authAttemptService.resetLoginAttempts(email, ip);
    await this.startSession(user, metadata, response);
    return this.toPublicUser(user);
  }

  async logout(
    accessToken: string | undefined,
    refreshToken: string | undefined,
    response: Response,
  ) {
    const session = await this.getSessionFromAuthCookies(
      accessToken,
      refreshToken,
    );

    if (session) {
      await this.authSessionsRepository.revoke(session.sessionId);
    }

    this.clearAuthCookies(response);
    return { success: true };
  }

  async refresh(refreshToken: string | undefined, response: Response) {
    if (!refreshToken) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    let payload: JwtPayload;
    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      this.clearAuthCookies(response);
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    if (!payload.sub || !payload.sid) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const now = new Date();
    const session =
      await this.authSessionsRepository.findActiveByIdAndUserIdWithUser(
        payload.sid,
        payload.sub,
        now,
      );
    if (!session) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    if (!session.user.isActive) {
      await this.authSessionsRepository.revoke(session.id);
      this.clearAuthCookies(response);
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    if (
      !this.matchesStoredRefreshToken(refreshToken, session.refreshTokenHash)
    ) {
      await this.authSessionsRepository.revoke(session.id);
      this.clearAuthCookies(response);
      throw this.createUnauthorizedException(
        'Refresh token không hợp lệ hoặc đã được dùng lại',
        REFRESH_TOKEN_INVALID_OR_REUSED,
      );
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await this.signTokenPair(session.user, session.id);
    const rotation = await this.authSessionsRepository.rotateIfCurrent({
      id: session.id,
      userId: payload.sub,
      currentRefreshTokenHash: session.refreshTokenHash,
      newRefreshTokenHash: this.hashRefreshToken(newRefreshToken),
      expiresAt: new Date(Date.now() + this.getRefreshMaxAge()),
      now,
    });

    if (rotation.count !== 1) {
      throw this.createUnauthorizedException(
        'Refresh token đã được xoay vòng bởi một yêu cầu khác',
        REFRESH_TOKEN_ALREADY_ROTATED,
      );
    }

    this.setAuthCookies(response, accessToken, newRefreshToken);
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
    return timingSafeTokenEqual(cookieState, queryState);
  }

  async loginWithGoogle(
    profile: GoogleProfile,
    metadata: RequestMetadata,
    response: Response,
  ) {
    if (!profile.email || !profile.emailVerified) {
      throw new UnauthorizedException(
        'Tài khoản Google chưa được xác minh email',
      );
    }

    const email = this.authAttemptService.normalizeEmail(profile.email);
    let user = await this.usersService.findByEmail(email, true);
    if (!user) {
      user = await this.usersService.createCustomerForAuth({
        fullName: profile.fullName,
        email,
        provider: AuthProvider.GOOGLE,
        googleId: profile.googleId,
      });
    } else if (!user.isActive) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    } else if (user.provider === AuthProvider.LOCAL) {
      user = await this.usersService.updateAuthFields(user.id, {
        googleId: profile.googleId,
      });
    }

    await this.startSession(user, metadata, response);
    return this.toPublicUser(user);
  }

  async changePassword(
    actor: AuthenticatedUser,
    input: { currentPassword: string; newPassword: string },
    response: Response,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user || user.provider !== AuthProvider.LOCAL || !user.passwordHash) {
      throw new BadRequestException({
        code: 'ACCOUNT_PASSWORD_NOT_CONFIGURED',
        message: 'Tài khoản này không sử dụng mật khẩu Bookora',
      });
    }
    const currentPasswordValid = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordValid) {
      throw new BadRequestException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'Mật khẩu hiện tại không chính xác',
      });
    }
    if (await bcrypt.compare(input.newPassword, user.passwordHash)) {
      throw new BadRequestException({
        code: 'NEW_PASSWORD_SAME_AS_CURRENT',
        message: 'Mật khẩu mới không được trùng mật khẩu hiện tại',
      });
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    const { accessToken, refreshToken } = await this.signTokenPair(
      user,
      actor.sessionId,
    );
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const now = new Date();
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const currentSession = await tx.authSession.findFirst({
            where: {
              id: actor.sessionId,
              userId: actor.id,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            select: { id: true },
          });
          if (!currentSession) {
            throw new UnauthorizedException({
              code: 'AUTH_SESSION_NOT_FOUND',
              message: 'Phiên đăng nhập hiện tại không còn hợp lệ',
            });
          }
          const passwordUpdate = await tx.user.updateMany({
            where: { id: actor.id, passwordHash: user.passwordHash },
            data: { passwordHash },
          });
          if (passwordUpdate.count !== 1) {
            throw new BadRequestException({
              code: 'CURRENT_PASSWORD_INVALID',
              message: 'Mật khẩu hiện tại đã thay đổi, vui lòng thử lại',
            });
          }
          await tx.authSession.updateMany({
            where: {
              userId: actor.id,
              id: { not: actor.sessionId },
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          const rotation = await tx.authSession.updateMany({
            where: {
              id: actor.sessionId,
              userId: actor.id,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: {
              refreshTokenHash,
              expiresAt: new Date(Date.now() + this.getRefreshMaxAge()),
            },
          });
          if (rotation.count !== 1) {
            throw new UnauthorizedException({
              code: 'AUTH_SESSION_ROTATION_FAILED',
              message: 'Không thể xoay vòng phiên đăng nhập hiện tại',
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException({
          code: 'AUTH_SESSION_ROTATION_FAILED',
          message: 'Phiên đăng nhập vừa thay đổi, vui lòng thử lại',
        });
      }
      throw error;
    }
    this.setAuthCookies(response, accessToken, refreshToken);
    return { success: true };
  }

  private async startSession(
    user: User,
    metadata: RequestMetadata,
    response: Response,
  ) {
    const session = await this.authSessionsRepository.create({
      userId: user.id,
      refreshTokenHash: randomBytes(32).toString('hex'),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      expiresAt: new Date(Date.now() + this.getRefreshMaxAge()),
    });

    try {
      const { accessToken, refreshToken } = await this.signTokenPair(
        user,
        session.id,
      );
      await this.authSessionsRepository.update(session.id, {
        refreshTokenHash: this.hashRefreshToken(refreshToken),
      });
      await this.usersService.updateLastLoginAt(user.id);
      this.setAuthCookies(response, accessToken, refreshToken);
    } catch (error) {
      await this.authSessionsRepository.revoke(session.id);
      throw error;
    }
  }

  private async signTokenPair(
    user: User,
    sessionId: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      sid: sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('auth.jwt.accessSecret'),
        expiresIn: (this.configService.get<string>(
          'auth.jwt.accessExpiresIn',
        ) ?? '15m') as SignOptions['expiresIn'],
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('auth.jwt.refreshSecret'),
        expiresIn: (this.configService.get<string>(
          'auth.jwt.refreshExpiresIn',
        ) ?? '7d') as SignOptions['expiresIn'],
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    response.cookie('accessToken', accessToken, {
      ...this.baseCookieOptions(),
      maxAge: this.getAccessMaxAge(),
    });
    response.cookie('refreshToken', refreshToken, {
      ...this.baseCookieOptions(),
      maxAge: this.getRefreshMaxAge(),
    });
  }

  private verifyRefreshToken(refreshToken: string) {
    return this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
      secret: this.configService.getOrThrow<string>('auth.jwt.refreshSecret'),
    });
  }

  private verifyAccessToken(accessToken: string) {
    return this.jwtService.verifyAsync<JwtPayload>(accessToken, {
      secret: this.configService.getOrThrow<string>('auth.jwt.accessSecret'),
    });
  }

  private async getSessionFromAuthCookies(
    accessToken: string | undefined,
    refreshToken: string | undefined,
  ) {
    if (accessToken) {
      try {
        const payload = await this.verifyAccessToken(accessToken);
        return payload.sub && payload.sid
          ? { userId: payload.sub, sessionId: payload.sid }
          : null;
      } catch {
        // Try refresh token next so logout still works after access expiry.
      }
    }

    if (refreshToken) {
      try {
        const payload = await this.verifyRefreshToken(refreshToken);
        return payload.sub && payload.sid
          ? { userId: payload.sub, sessionId: payload.sid }
          : null;
      } catch {
        return null;
      }
    }

    return null;
  }

  private clearAuthCookies(response: Response) {
    const options = this.baseCookieOptions();
    response.clearCookie('accessToken', options);
    response.clearCookie('refreshToken', options);
    response.clearCookie('csrfToken', { ...options, httpOnly: false });
    response.clearCookie('oauthState', options);
  }

  private toPublicUser(user: User): PublicAuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? '',
      type: user.type,
    };
  }

  private baseCookieOptions(): CookieOptionsConfig {
    const isProduction =
      this.configService.get<string>('environment.nodeEnv') === 'production';
    const frontendUrl = this.configService.get<string>('app.frontendUrl') ?? '';
    const backendDomain = this.configService.get<string>('cookie.domain');
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
    return parseDuration(
      this.configService.get<string>('auth.jwt.accessExpiresIn') ?? '15m',
    );
  }

  private getRefreshMaxAge() {
    return parseDuration(
      this.configService.get<string>('auth.jwt.refreshExpiresIn') ?? '7d',
    );
  }

  private hashRefreshToken(refreshToken: string) {
    return createHmac(
      'sha256',
      this.configService.getOrThrow<string>('auth.jwt.refreshTokenHashSecret'),
    )
      .update(refreshToken)
      .digest('hex');
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

  private createUnauthorizedException(message: string, code: string) {
    return new UnauthorizedException({ message, code });
  }
}
