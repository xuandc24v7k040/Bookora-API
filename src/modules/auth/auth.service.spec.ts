import { UnauthorizedException } from '@nestjs/common';
import { AuthProvider, UserType, type User } from '@/generated/prisma/client';
import { createHmac } from 'crypto';
import type { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { EmailLoginRestrictedException } from './auth-attempt.service';

jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');
  return {
    ...actual,
    compare: jest.fn(),
  };
});

const refreshHashSecret = 'refresh-hash-secret';
const compareMock = bcrypt.compare as jest.Mock;

const activeUser = {
  id: '01JVCY8VZ10XWBQ9M3B0EG9D7K',
  email: 'user@example.com',
  passwordHash: 'password-hash',
  fullName: 'User',
  phone: null,
  gender: null,
  birthday: null,
  type: UserType.CUSTOMER,
  provider: AuthProvider.LOCAL,
  googleId: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User;

describe('AuthService', () => {
  const usersService = {
    findByEmail: jest.fn(),
    createCustomerForAuth: jest.fn(),
    updateAuthFields: jest.fn(),
    updateLastLoginAt: jest.fn(),
  };
  const authAttemptService = {
    normalizeEmail: jest.fn((email: string) => email.toLowerCase()),
    checkLoginBlocked: jest.fn(),
    recordLoginFailure: jest.fn(),
    resetLoginAttempts: jest.fn(),
  };
  const authSessionsRepository = {
    create: jest.fn(),
    findActiveByIdAndUserIdWithUser: jest.fn(),
    revokeActiveByUserId: jest.fn(),
    rotateIfCurrent: jest.fn(),
    update: jest.fn(),
    revoke: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const configValues: Record<string, unknown> = {
    'auth.jwt.accessSecret': 'access-secret',
    'auth.jwt.refreshSecret': 'refresh-secret',
    'auth.jwt.refreshTokenHashSecret': refreshHashSecret,
    'auth.jwt.accessExpiresIn': '15m',
    'auth.jwt.refreshExpiresIn': '7d',
    'environment.nodeEnv': 'test',
    'app.frontendUrl': 'http://localhost:5173',
    'cookie.domain': '',
  };
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
    getOrThrow: jest.fn((key: string) => configValues[key]),
  };
  const responseMock = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
  const response = responseMock as unknown as Response;

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    compareMock.mockReset();
    authAttemptService.normalizeEmail.mockImplementation((email: string) =>
      email.toLowerCase(),
    );
    authAttemptService.checkLoginBlocked.mockResolvedValue(undefined);
    authAttemptService.recordLoginFailure.mockResolvedValue(undefined);
    authAttemptService.resetLoginAttempts.mockResolvedValue(undefined);
    service = new AuthService(
      usersService as never,
      authAttemptService as never,
      authSessionsRepository as never,
      jwtService as never,
      configService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs bcrypt compare with a dummy hash when email does not exist', async () => {
    compareMock.mockResolvedValue(false);
    usersService.findByEmail.mockResolvedValue(null);

    let error: UnauthorizedException | undefined;
    try {
      await service.login(
        { email: 'missing@example.com', password: 'Password1' },
        { ipAddress: '127.0.0.1' },
        response,
      );
    } catch (caught) {
      error = caught as UnauthorizedException;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(compareMock).toHaveBeenCalledWith(
      'Password1',
      expect.stringMatching(/^\$2[aby]\$12\$/),
    );
    expect(authAttemptService.recordLoginFailure).toHaveBeenCalledWith(
      'missing@example.com',
      '127.0.0.1',
    );
    expect(authSessionsRepository.create).not.toHaveBeenCalled();
  });

  it('returns the same failed login response for missing email and wrong password', async () => {
    compareMock.mockResolvedValue(false);
    usersService.findByEmail.mockResolvedValueOnce(null);
    let missingEmailResponse: unknown;
    try {
      await service.login(
        { email: 'missing@example.com', password: 'Password1' },
        { ipAddress: '127.0.0.1' },
        response,
      );
    } catch (caught) {
      missingEmailResponse = (caught as UnauthorizedException).getResponse();
    }

    usersService.findByEmail.mockResolvedValueOnce(activeUser);
    let wrongPasswordResponse: unknown;
    try {
      await service.login(
        { email: activeUser.email, password: 'Password1' },
        { ipAddress: '127.0.0.1' },
        response,
      );
    } catch (caught) {
      wrongPasswordResponse = (caught as UnauthorizedException).getResponse();
    }

    expect(wrongPasswordResponse).toEqual(missingEmailResponse);
  });

  it('runs dummy bcrypt compare when email is already locked without writing attempts again', async () => {
    compareMock.mockResolvedValue(false);
    const lockedError = new EmailLoginRestrictedException();
    authAttemptService.checkLoginBlocked.mockRejectedValue(lockedError);

    await expect(
      service.login(
        { email: activeUser.email, password: 'Password1' },
        { ipAddress: '127.0.0.1' },
        response,
      ),
    ).rejects.toBe(lockedError);

    expect(compareMock).toHaveBeenCalledWith(
      'Password1',
      expect.stringMatching(/^\$2[aby]\$12\$/),
    );
    expect(usersService.findByEmail).not.toHaveBeenCalled();
    expect(authAttemptService.recordLoginFailure).not.toHaveBeenCalled();
    expect(authAttemptService.resetLoginAttempts).not.toHaveBeenCalled();
    expect(authSessionsRepository.create).not.toHaveBeenCalled();
  });

  it('logs in valid local users as before', async () => {
    compareMock.mockResolvedValue(true);
    usersService.findByEmail.mockResolvedValue(activeUser);
    authSessionsRepository.create.mockResolvedValue({ id: 'session-id' });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await expect(
      service.login(
        { email: activeUser.email, password: 'Password1' },
        { ipAddress: '127.0.0.1', userAgent: 'jest' },
        response,
      ),
    ).resolves.toMatchObject({ id: activeUser.id });

    expect(authAttemptService.resetLoginAttempts).toHaveBeenCalledWith(
      activeUser.email,
      '127.0.0.1',
    );
    expect(authSessionsRepository.create).toHaveBeenCalled();
    expect(responseMock.cookie).toHaveBeenCalledTimes(2);
  });

  it('validates OAuth state with timing-safe token semantics', () => {
    expect(service.validateOauthState('state-token', 'state-token')).toBe(true);
    expect(service.validateOauthState('state-token', 'other-token')).toBe(
      false,
    );
    expect(() =>
      service.validateOauthState('short', 'much-longer-token'),
    ).not.toThrow();
    expect(service.validateOauthState(undefined, 'state-token')).toBe(false);
  });

  it('registers local users through the transactional CUSTOMER flow', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.createCustomerForAuth.mockResolvedValue(activeUser);

    await expect(
      service.register({
        email: activeUser.email,
        fullName: activeUser.fullName ?? '',
        password: 'Password1',
      }),
    ).resolves.toMatchObject({
      id: activeUser.id,
      type: UserType.CUSTOMER,
    });

    expect(usersService.createCustomerForAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        email: activeUser.email,
        provider: AuthProvider.LOCAL,
        passwordHash: expect.any(String),
      }),
    );
  });

  it('rejects inactive users during local login without resetting attempts', async () => {
    compareMock.mockResolvedValue(false);
    usersService.findByEmail.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });

    await expect(
      service.login(
        { email: activeUser.email, password: 'Password1' },
        { ipAddress: '127.0.0.1' },
        response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authAttemptService.recordLoginFailure).toHaveBeenCalled();
    expect(authAttemptService.resetLoginAttempts).not.toHaveBeenCalled();
    expect(authSessionsRepository.create).not.toHaveBeenCalled();
    expect(responseMock.cookie).not.toHaveBeenCalled();
  });

  it('rejects an existing inactive user during Google login', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });

    await expect(
      service.loginWithGoogle(
        {
          googleId: 'google-id',
          email: activeUser.email,
          fullName: activeUser.fullName ?? '',
          emailVerified: true,
        },
        {},
        response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authSessionsRepository.create).not.toHaveBeenCalled();
    expect(responseMock.cookie).not.toHaveBeenCalled();
  });

  it('creates a new Google user through the transactional customer flow', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.createCustomerForAuth.mockResolvedValue({
      ...activeUser,
      provider: AuthProvider.GOOGLE,
      googleId: 'google-id',
    });
    authSessionsRepository.create.mockResolvedValue({ id: 'session-id' });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await service.loginWithGoogle(
      {
        googleId: 'google-id',
        email: activeUser.email,
        fullName: activeUser.fullName ?? '',
        emailVerified: true,
      },
      {},
      response,
    );

    expect(usersService.createCustomerForAuth).toHaveBeenCalledWith({
      fullName: activeUser.fullName,
      email: activeUser.email,
      provider: AuthProvider.GOOGLE,
      googleId: 'google-id',
    });
  });

  it('signs both tokens with the real session id', async () => {
    const sessionId = '01JVCY8VZ10XWBQ9M3B0EG9D7M';
    usersService.findByEmail.mockResolvedValue({
      ...activeUser,
      provider: AuthProvider.GOOGLE,
    });
    authSessionsRepository.create.mockResolvedValue({ id: sessionId });
    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    await service.loginWithGoogle(
      {
        googleId: 'google-id',
        email: activeUser.email,
        fullName: activeUser.fullName ?? '',
        emailVerified: true,
      },
      {},
      response,
    );

    expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sub: activeUser.id, sid: sessionId }),
      expect.any(Object),
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sub: activeUser.id, sid: sessionId }),
      expect.any(Object),
    );
    const firstPayload = jwtService.signAsync.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(firstPayload).not.toHaveProperty('role');
    expect(usersService.updateLastLoginAt).toHaveBeenCalledWith(activeUser.id);
  });

  it('rejects refresh for an inactive user and revokes that session', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: activeUser.id,
      sid: 'session-id',
    });
    authSessionsRepository.findActiveByIdAndUserIdWithUser.mockResolvedValue({
      id: 'session-id',
      user: { ...activeUser, isActive: false },
    });

    await expect(
      service.refresh('refresh-token', response),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authSessionsRepository.revoke).toHaveBeenCalledWith('session-id');
    expect(responseMock.clearCookie).toHaveBeenCalled();
    expect(authSessionsRepository.rotateIfCurrent).not.toHaveBeenCalled();
  });

  it('rotates a valid refresh token and sets new cookies after the atomic update', async () => {
    const refreshToken = 'current-refresh-token';
    jwtService.verifyAsync.mockResolvedValue({
      sub: activeUser.id,
      sid: 'session-id',
    });
    authSessionsRepository.findActiveByIdAndUserIdWithUser.mockResolvedValue({
      id: 'session-id',
      userId: activeUser.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      user: activeUser,
    });
    jwtService.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');
    authSessionsRepository.rotateIfCurrent.mockResolvedValue({ count: 1 });

    await expect(service.refresh(refreshToken, response)).resolves.toEqual({
      success: true,
    });

    expect(authSessionsRepository.rotateIfCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-id',
        userId: activeUser.id,
        currentRefreshTokenHash: hashRefreshToken(refreshToken),
      }),
    );
    expect(responseMock.cookie).toHaveBeenCalledTimes(2);
    expect(responseMock.clearCookie).not.toHaveBeenCalled();
  });

  it('does not revoke or clear cookies when another refresh wins the race', async () => {
    const refreshToken = 'current-refresh-token';
    jwtService.verifyAsync.mockResolvedValue({
      sub: activeUser.id,
      sid: 'session-id',
    });
    authSessionsRepository.findActiveByIdAndUserIdWithUser.mockResolvedValue({
      id: 'session-id',
      userId: activeUser.id,
      refreshTokenHash: hashRefreshToken(refreshToken),
      user: activeUser,
    });
    jwtService.signAsync
      .mockResolvedValueOnce('new-access-token')
      .mockResolvedValueOnce('new-refresh-token');
    authSessionsRepository.rotateIfCurrent.mockResolvedValue({ count: 0 });

    let error: UnauthorizedException | undefined;
    try {
      await service.refresh(refreshToken, response);
    } catch (caught) {
      error = caught as UnauthorizedException;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error?.getResponse()).toMatchObject({
      code: 'REFRESH_TOKEN_ALREADY_ROTATED',
    });
    expect(authSessionsRepository.revoke).not.toHaveBeenCalled();
    expect(responseMock.clearCookie).not.toHaveBeenCalled();
    expect(responseMock.cookie).not.toHaveBeenCalled();
  });

  it('revokes only the matching session on an initial refresh hash mismatch', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: activeUser.id,
      sid: 'session-id',
    });
    authSessionsRepository.findActiveByIdAndUserIdWithUser.mockResolvedValue({
      id: 'session-id',
      userId: activeUser.id,
      refreshTokenHash: hashRefreshToken('different-token'),
      user: activeUser,
    });

    let error: UnauthorizedException | undefined;
    try {
      await service.refresh('old-token', response);
    } catch (caught) {
      error = caught as UnauthorizedException;
    }

    expect(error?.getResponse()).toMatchObject({
      code: 'REFRESH_TOKEN_INVALID_OR_REUSED',
    });
    expect(authSessionsRepository.revoke).toHaveBeenCalledWith('session-id');
    expect(authSessionsRepository.revokeActiveByUserId).not.toHaveBeenCalled();
    expect(responseMock.clearCookie).toHaveBeenCalled();
  });
});

function hashRefreshToken(token: string): string {
  return createHmac('sha256', refreshHashSecret).update(token).digest('hex');
}
