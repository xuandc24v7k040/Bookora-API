import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '../auth-error-codes';
import { CsrfGuard } from './csrf.guard';

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows GET without a CSRF token', () => {
    expect(guard.canActivate(context({ method: 'GET' }))).toBe(true);
  });

  it.each([
    [
      'missing cookie and header',
      { method: 'POST', cookies: {}, header: () => undefined },
    ],
    [
      'missing cookie',
      {
        method: 'POST',
        cookies: {},
        header: () => 'header-token',
      },
    ],
    [
      'missing header',
      {
        method: 'POST',
        cookies: { csrfToken: 'cookie-token' },
        header: () => undefined,
      },
    ],
    [
      'mismatch',
      {
        method: 'PATCH',
        cookies: { csrfToken: 'cookie-token' },
        header: () => 'different-token',
      },
    ],
  ])('rejects mutation with %s CSRF', (_caseName, request) => {
    let error: ForbiddenException | undefined;
    try {
      guard.canActivate(context(request));
    } catch (caught) {
      error = caught as ForbiddenException;
    }

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error?.getStatus()).toBe(403);
    expect(error?.getResponse()).toMatchObject({
      message: 'CSRF token không hợp lệ',
      code: AUTH_ERROR_CODES.csrfInvalid,
    });
  });

  it('allows mutation with matching cookie and header tokens', () => {
    expect(
      guard.canActivate(
        context({
          method: 'DELETE',
          cookies: { csrfToken: 'token' },
          header: () => 'token',
        }),
      ),
    ).toBe(true);
  });

  it('rejects different length tokens without throwing a low-level error', () => {
    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          cookies: { csrfToken: 'short' },
          header: () => 'much-longer-token',
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});

function context(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
