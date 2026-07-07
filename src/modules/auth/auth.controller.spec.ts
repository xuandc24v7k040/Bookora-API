import type { Request } from 'express';
import { UserType } from '@/generated/prisma/client';
import { AUTH_ERROR_CODES } from './auth-error-codes';
import { AuthController } from './auth.controller';
import type { GoogleOauthRequest } from './guards/google-oauth.guard';

describe('AuthController client IP', () => {
  const controller = new AuthController({} as never, {} as never, {} as never);
  const getClientIp = (
    controller as unknown as { getClientIp(request: Request): string }
  ).getClientIp.bind(controller);

  it('uses Express req.ip instead of parsing X-Forwarded-For', () => {
    const request = {
      ip: '10.0.0.5',
      headers: { 'x-forwarded-for': '203.0.113.10' },
      socket: { remoteAddress: '10.0.0.5' },
    } as unknown as Request;

    expect(getClientIp(request)).toBe('10.0.0.5');
  });

  it('normalizes IPv4-mapped IPv6 addresses', () => {
    const request = {
      ip: '::ffff:127.0.0.1',
      socket: { remoteAddress: '::ffff:127.0.0.1' },
    } as unknown as Request;

    expect(getClientIp(request)).toBe('127.0.0.1');
  });

  it('returns a safe authorization summary from /auth/me', () => {
    const result = controller.me({
      id: 'user-id',
      email: 'user@example.com',
      fullName: 'User',
      type: UserType.BRANCH,
      roles: [],
      permissions: ['orders.read'],
      globalRoles: [],
      globalPermissions: [],
      branchAssignments: [],
      allowedBranchIds: ['branch-id'],
      branches: [
        {
          id: 'branch-id',
          code: 'can-tho',
          name: 'Can Tho',
          isPrimary: true,
        },
      ],
      primaryBranchId: 'branch-id',
      maxRoleLevel: 30,
      isSuperAdmin: false,
      sessionId: 'session-id',
    });

    expect(result).toMatchObject({
      id: 'user-id',
      type: UserType.BRANCH,
      permissions: ['orders.read'],
      primaryBranchId: 'branch-id',
    });
    expect(result).not.toHaveProperty('sessionId');
    expect(result).not.toHaveProperty('allowedBranchIds');
  });
});

describe('AuthController Google OAuth callback', () => {
  const authService = {
    validateOauthState: jest.fn(),
    loginWithGoogle: jest.fn(),
  };
  const configService = {
    get: jest.fn(() => 'http://frontend.test'),
  };
  const controller = new AuthController(
    authService as never,
    {} as never,
    configService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockReturnValue('http://frontend.test');
  });

  it('redirects access_denied guard failures to the frontend with a stable code', async () => {
    const response = responseMock();
    const request = {
      googleOauthFailure: AUTH_ERROR_CODES.googleAccessDenied,
      signedCookies: { oauthState: 'state' },
    } as unknown as GoogleOauthRequest;

    await controller.googleCallback(request, 'state', response as never);

    expect(response.clearCookie).toHaveBeenCalledWith('oauthState');
    expect(response.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=google_access_denied',
    );
    expect(authService.loginWithGoogle).not.toHaveBeenCalled();
  });

  it('redirects invalid OAuth state with google_state_invalid', async () => {
    authService.validateOauthState.mockReturnValue(false);
    const response = responseMock();
    const request = {
      signedCookies: { oauthState: 'state' },
    } as unknown as GoogleOauthRequest;

    await controller.googleCallback(request, 'other-state', response as never);

    expect(response.clearCookie).toHaveBeenCalledWith('oauthState');
    expect(response.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=google_state_invalid',
    );
    expect(authService.loginWithGoogle).not.toHaveBeenCalled();
  });

  it('keeps the Google OAuth success redirect unchanged', async () => {
    authService.validateOauthState.mockReturnValue(true);
    authService.loginWithGoogle.mockResolvedValue(undefined);
    const response = responseMock();
    const request = {
      signedCookies: { oauthState: 'state' },
      user: { email: 'user@example.com' },
      ip: '127.0.0.1',
      header: jest.fn(() => 'jest'),
    } as unknown as GoogleOauthRequest;

    await controller.googleCallback(request, 'state', response as never);

    expect(authService.loginWithGoogle).toHaveBeenCalled();
    expect(response.clearCookie).toHaveBeenCalledWith('oauthState');
    expect(response.redirect).toHaveBeenCalledWith(
      'http://frontend.test/auth/callback?success=true',
    );
  });

  it('redirects loginWithGoogle failures without leaking raw errors', async () => {
    authService.validateOauthState.mockReturnValue(true);
    authService.loginWithGoogle.mockRejectedValue(new Error('provider raw'));
    const response = responseMock();
    const request = {
      signedCookies: { oauthState: 'state' },
      user: { email: 'user@example.com' },
      ip: '127.0.0.1',
      header: jest.fn(() => 'jest'),
    } as unknown as GoogleOauthRequest;

    await controller.googleCallback(request, 'state', response as never);

    expect(response.clearCookie).toHaveBeenCalledWith('oauthState');
    expect(response.redirect).toHaveBeenCalledWith(
      'http://frontend.test/login?error=google_auth_failed',
    );
    expect(response.redirect.mock.calls[0]?.[0]).not.toContain('provider raw');
  });
});

interface MockResponse {
  clearCookie: jest.Mock;
  redirect: jest.Mock;
}

function responseMock(): MockResponse {
  return {
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  };
}
