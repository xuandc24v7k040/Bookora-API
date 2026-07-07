import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '../auth-error-codes';
import {
  GoogleOauthGuard,
  type GoogleOauthRequest,
} from './google-oauth.guard';

describe('GoogleOauthGuard', () => {
  const authService = {
    createOauthState: jest.fn(() => 'created-state'),
  };
  const guard = new GoogleOauthGuard(authService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates OAuth state on the start route', () => {
    const request = { path: '/auth/google', query: {} } as GoogleOauthRequest;
    const response = {};

    expect(guard.getAuthenticateOptions(context(request, response))).toEqual({
      scope: ['email', 'profile'],
      state: 'created-state',
    });
    expect(authService.createOauthState).toHaveBeenCalledWith(response);
  });

  it('marks access_denied callback failures without throwing before controller', () => {
    const request = {
      path: '/auth/google/callback',
      query: { error: 'access_denied' },
    } as unknown as GoogleOauthRequest;

    guard.getAuthenticateOptions(context(request));
    const user = guard.handleRequest(
      new UnauthorizedException(),
      undefined,
      undefined,
      context(request),
    );

    expect(user).toEqual({});
    expect(request.googleOauthFailure).toBe(
      AUTH_ERROR_CODES.googleAccessDenied,
    );
  });

  it('marks generic callback guard failures without leaking provider details', () => {
    const request = {
      path: '/auth/google/callback',
      query: {},
    } as unknown as GoogleOauthRequest;

    const user = guard.handleRequest(
      new Error('raw provider detail'),
      undefined,
      undefined,
      context(request),
    );

    expect(user).toEqual({});
    expect(request.googleOauthFailure).toBe(AUTH_ERROR_CODES.googleAuthFailed);
  });

  it('keeps non-callback authentication failures as UnauthorizedException', () => {
    const request = { path: '/auth/google', query: {} } as GoogleOauthRequest;

    expect(() =>
      guard.handleRequest(undefined, undefined, undefined, context(request)),
    ).toThrow(UnauthorizedException);
  });
});

function context(request: GoogleOauthRequest, response: unknown = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}
