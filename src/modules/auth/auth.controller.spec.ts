import type { Request } from 'express';
import { UserType } from '@/generated/prisma/client';
import { AuthController } from './auth.controller';

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
