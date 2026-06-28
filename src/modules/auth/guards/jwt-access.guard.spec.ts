import { UnauthorizedException } from '@nestjs/common';
import { JwtAccessGuard } from './jwt-access.guard';

describe('JwtAccessGuard', () => {
  const guard = new JwtAccessGuard();

  it('rejects requests without an authenticated user', () => {
    expect(() => guard.handleRequest(undefined, undefined)).toThrow(
      UnauthorizedException,
    );
  });

  it('returns the authenticated user', () => {
    const user = { id: 'user-id' };

    expect(guard.handleRequest(undefined, user)).toBe(user);
  });
});
