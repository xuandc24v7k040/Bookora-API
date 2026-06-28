import { UnauthorizedException } from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import { JwtAccessStrategy } from './jwt-access.strategy';

describe('JwtAccessStrategy', () => {
  const configService = {
    getOrThrow: jest.fn(() => 'access-secret'),
  };
  const authorizationService = {
    resolvePrincipal: jest.fn(),
  };

  let strategy: JwtAccessStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtAccessStrategy(
      configService as never,
      authorizationService as never,
    );
  });

  it('accepts an active user only through the matching active session', async () => {
    authorizationService.resolvePrincipal.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      fullName: 'User',
      type: UserType.CUSTOMER,
      roles: [],
      permissions: [],
      allowedBranchIds: [],
      branches: [],
      primaryBranchId: null,
      maxRoleLevel: 0,
      isSuperAdmin: false,
      sessionId: 'session-id',
    });

    await expect(
      strategy.validate({
        sub: 'user-id',
        sid: 'session-id',
        email: 'user@example.com',
      }),
    ).resolves.toMatchObject({ id: 'user-id', type: UserType.CUSTOMER });

    expect(authorizationService.resolvePrincipal).toHaveBeenCalledWith(
      'session-id',
      'user-id',
    );
  });

  it.each([
    'revoked, expired, missing, or user-mismatched session',
    'inactive user',
  ])('rejects %s', async () => {
    authorizationService.resolvePrincipal.mockRejectedValue(
      new UnauthorizedException(),
    );

    await expect(
      strategy.validate({
        sub: 'user-id',
        sid: 'session-id',
        email: 'user@example.com',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens without a session id', async () => {
    await expect(
      strategy.validate({
        sub: 'user-id',
        sid: '',
        email: 'user@example.com',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authorizationService.resolvePrincipal).not.toHaveBeenCalled();
  });
});
