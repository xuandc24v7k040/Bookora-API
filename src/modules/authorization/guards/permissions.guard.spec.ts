import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserType } from '@/generated/prisma/client';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = { getAllAndMerge: jest.fn() };
  const guard = new PermissionsGuard(reflector as unknown as Reflector);

  beforeEach(() => jest.clearAllMocks());

  it('merges controller and handler metadata and removes duplicates', () => {
    reflector.getAllAndMerge.mockReturnValue([
      'staff.read',
      'staff.create',
      'staff.read',
    ]);
    const context = executionContext(
      actor({ permissions: ['staff.read', 'staff.create'] }),
    );

    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndMerge).toHaveBeenCalledWith(
      'bookora:authorization:permissions',
      [context.getClass(), context.getHandler()],
    );
  });

  it('allows an authenticated request without permission metadata', () => {
    reflector.getAllAndMerge.mockReturnValue(undefined);
    expect(guard.canActivate(executionContext(actor()))).toBe(true);
  });

  it('rejects an unauthenticated request', () => {
    expect(() => guard.canActivate(executionContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an actor missing any required permission', () => {
    reflector.getAllAndMerge.mockReturnValue(['staff.read', 'staff.create']);
    try {
      guard.canActivate(
        executionContext(actor({ permissions: ['staff.read'] })),
      );
      fail('Expected permission denial');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getStatus()).toBe(403);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    }
  });

  it('allows an actor with every required permission', () => {
    reflector.getAllAndMerge.mockReturnValue(['staff.read', 'staff.create']);
    expect(
      guard.canActivate(
        executionContext(
          actor({ permissions: ['staff.read', 'staff.create'] }),
        ),
      ),
    ).toBe(true);
  });

  it.each(['products.read', 'stock_receipts.create', 'stock_receipts.update'])(
    'allows an actor with any selector permission: %s',
    (permission) => {
      reflector.getAllAndMerge.mockImplementation((key: string) =>
        key === 'bookora:authorization:any-permissions'
          ? ['products.read', 'stock_receipts.create', 'stock_receipts.update']
          : undefined,
      );
      expect(
        guard.canActivate(
          executionContext(actor({ permissions: [permission] })),
        ),
      ).toBe(true);
    },
  );

  it('rejects an actor missing every any-of permission', () => {
    reflector.getAllAndMerge.mockImplementation((key: string) =>
      key === 'bookora:authorization:any-permissions'
        ? ['products.read', 'stock_receipts.create']
        : undefined,
    );
    expect(() =>
      guard.canActivate(
        executionContext(actor({ permissions: ['inventory.read'] })),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows an active Super Admin to bypass permission checks', () => {
    reflector.getAllAndMerge.mockReturnValue(['permissions.delete']);
    expect(
      guard.canActivate(
        executionContext(actor({ isSuperAdmin: true, permissions: [] })),
      ),
    ).toBe(true);
  });
});

function executionContext(user: ReturnType<typeof actor> | undefined) {
  const request = { user };
  const handler = () => undefined;
  class Controller {}
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => Controller,
  } as unknown as ExecutionContext;
}

function actor(overrides: Record<string, unknown> = {}) {
  return {
    id: 'actor-id',
    email: 'actor@example.com',
    fullName: 'Actor',
    type: UserType.BRANCH,
    roles: [],
    permissions: [],
    allowedBranchIds: [],
    branches: [],
    primaryBranchId: null,
    maxRoleLevel: 70,
    isSuperAdmin: false,
    sessionId: 'session-id',
    ...overrides,
  };
}
