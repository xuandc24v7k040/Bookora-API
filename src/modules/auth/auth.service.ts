import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Role, type User } from '@/generated/prisma/client';
import { parseDuration } from '@/common/utils';
import type { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { AuthAttemptService } from './auth-attempt.service';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleProfile } from './strategies/google.strategy';
import { AuthenticatedUser } from './types/authenticated-user.type';
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

const INVALID_CREDENTIALS_MESSAGE = 'Email hoặc mật khẩu không đúng.';
const INVALID_SESSION_MESSAGE = 'Phiên đăng nhập không hợp lệ';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authAttemptService: AuthAttemptService,
    private readonly authSessionsRepository: AuthSessionsRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = this.authAttemptService.normalizeEmail(dto.email);
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.createForAuth({
      fullName: dto.fullName,
      email,
      passwordHash,
      provider: AuthProvider.LOCAL,
      role: Role.USER,
    });

    return this.toPublicUser(user);
  }

  async login(dto: LoginDto, metadata: RequestMetadata, response: Response) {
    const email = this.authAttemptService.normalizeEmail(dto.email);
    const ip = metadata.ipAddress ?? 'unknown';

    await this.authAttemptService.checkLoginBlocked(email, ip);
    const user = await this.usersService.findByEmail(email, true);

    if (!user || user.provider !== AuthProvider.LOCAL || !user.passwordHash) {
      await this.authAttemptService.recordLoginFailure(email, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
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
    const userId = await this.getUserIdFromAuthCookies(
      accessToken,
      refreshToken,
    );

    if (userId) {
      await this.authSessionsRepository.revokeActiveByUserId(userId);
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

    const session =
      await this.authSessionsRepository.findActiveByUserIdWithUser(payload.sub);
    if (!session) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    if (
      !this.matchesStoredRefreshToken(refreshToken, session.refreshTokenHash)
    ) {
      await this.authSessionsRepository.revokeActiveByUserId(payload.sub);
      this.clearAuthCookies(response);
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã được dùng lại',
      );
    }

    await this.rotateSession(session.user, session.id, response);
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
      user = await this.usersService.createForAuth({
        fullName: profile.fullName,
        email,
        provider: AuthProvider.GOOGLE,
        googleId: profile.googleId,
        role: Role.USER,
      });
    } else if (user.provider === AuthProvider.LOCAL) {
      user = await this.usersService.updateAuthFields(user.id, {
        googleId: profile.googleId,
      });
    }

    await this.startSession(user, metadata, response);
    return this.toPublicUser(user);
  }

  private async startSession(
    user: User,
    metadata: RequestMetadata,
    response: Response,
  ) {
    await this.authSessionsRepository.revokeActiveByUserId(user.id);

    const { accessToken, refreshToken } = await this.signTokenPair(user);
    await this.authSessionsRepository.create({
      userId: user.id,
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      expiresAt: new Date(Date.now() + this.getRefreshMaxAge()),
    });

    this.setAuthCookies(response, accessToken, refreshToken);
  }

  private async rotateSession(
    user: User,
    sessionId: string,
    response: Response,
  ) {
    const { accessToken, refreshToken } = await this.signTokenPair(user);
    await this.authSessionsRepository.update(sessionId, {
      refreshTokenHash: this.hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + this.getRefreshMaxAge()),
    });
    this.setAuthCookies(response, accessToken, refreshToken);
  }

  private async signTokenPair(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: this.toPublicRole(user.role),
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

  private async getUserIdFromAuthCookies(
    accessToken: string | undefined,
    refreshToken: string | undefined,
  ) {
    if (accessToken) {
      try {
        const payload = await this.verifyAccessToken(accessToken);
        return payload.sub;
      } catch {
        // Try refresh token next so logout still works after access expiry.
      }
    }

    if (refreshToken) {
      try {
        const payload = await this.verifyRefreshToken(refreshToken);
        return payload.sub;
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

  private toPublicUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? '',
      role: this.toPublicRole(user.role),
    };
  }

  private toPublicRole(role: Role): 'user' | 'admin' {
    return role === Role.SUPER_ADMIN ? 'admin' : 'user';
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
}
