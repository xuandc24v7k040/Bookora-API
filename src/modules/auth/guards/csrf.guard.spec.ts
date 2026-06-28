import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows GET without a CSRF token', () => {
    expect(guard.canActivate(context({ method: 'GET' }))).toBe(true);
  });

  it.each([
    [{ method: 'POST', cookies: {}, header: () => undefined }],
    [
      {
        method: 'PATCH',
        cookies: { csrfToken: 'cookie-token' },
        header: () => 'different-token',
      },
    ],
  ])('rejects mutation with missing or mismatched CSRF', (request) => {
    expect(() => guard.canActivate(context(request))).toThrow(
      ForbiddenException,
    );
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
