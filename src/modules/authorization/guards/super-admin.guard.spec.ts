import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SuperAdminGuard } from './super-admin.guard';

describe('SuperAdminGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new SuperAdminGuard(reflector as unknown as Reflector);

  beforeEach(() => jest.clearAllMocks());

  it('passes endpoints without Super Admin metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(guard.canActivate(context(undefined))).toBe(true);
  });

  it('allows only an authenticated Super Admin when metadata is present', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(context({ isSuperAdmin: true }))).toBe(true);
    expect(() => guard.canActivate(context({ isSuperAdmin: false }))).toThrow();
    expect(() => guard.canActivate(context(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});

function context(user: { isSuperAdmin: boolean } | undefined) {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}
