import { UnauthorizedException } from '@nestjs/common';
import { PermissionEffect, UserType } from '@/generated/prisma/client';
import { AuthorizationService } from './authorization.service';

describe('AuthorizationService', () => {
  const repository = {
    findActiveSessionPrincipalSource: jest.fn(),
    findAllPermissionCodes: jest.fn(),
    findAllActiveBranches: jest.fn(),
  };

  let service: AuthorizationService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findAllActiveBranches.mockResolvedValue([]);
    service = new AuthorizationService(repository as never);
  });

  it('unions global permissions for CUSTOMER roles and removes duplicate roles', async () => {
    repository.findActiveSessionPrincipalSource.mockResolvedValue(
      source({
        type: UserType.CUSTOMER,
        userRoles: [
          userRole(
            role(
              'customer',
              'CUSTOMER',
              10,
              ['orders.read'],
              true,
              UserType.CUSTOMER,
            ),
          ),
          userRole(
            role(
              'member',
              'MEMBER',
              5,
              ['profile.read_own'],
              true,
              UserType.CUSTOMER,
            ),
          ),
          userRole(
            role(
              'customer',
              'CUSTOMER',
              10,
              ['orders.read'],
              true,
              UserType.CUSTOMER,
            ),
          ),
        ],
      }),
    );

    const principal = await service.resolvePrincipal('session-id', 'user-id');

    expect(principal.roles).toHaveLength(2);
    expect(principal.permissions).toEqual(['orders.read', 'profile.read_own']);
    expect(principal.maxRoleLevel).toBe(10);
  });

  it('adds UserPermission ALLOW', async () => {
    repository.findActiveSessionPrincipalSource.mockResolvedValue(
      source({
        type: UserType.CUSTOMER,
        userPermissions: [
          userPermission('products.update', PermissionEffect.ALLOW),
        ],
      }),
    );

    const principal = await service.resolvePrincipal('session-id', 'user-id');

    expect(principal.permissions).toEqual(['products.update']);
  });

  it('gives DENY precedence over role permissions and user ALLOW', async () => {
    repository.findActiveSessionPrincipalSource.mockResolvedValue(
      source({
        type: UserType.CUSTOMER,
        userRoles: [userRole(role('staff', 'STAFF', 30, ['orders.read']))],
        userPermissions: [
          userPermission('orders.read', PermissionEffect.ALLOW),
          userPermission('orders.read', PermissionEffect.DENY),
        ],
      }),
    );

    const principal = await service.resolvePrincipal('session-id', 'user-id');

    expect(principal.permissions).toEqual([]);
  });

  it('ignores inactive roles', async () => {
    repository.findActiveSessionPrincipalSource.mockResolvedValue(
      source({
        type: UserType.CUSTOMER,
        userRoles: [
          userRole(role('inactive', 'STAFF', 30, ['orders.read'], false)),
        ],
      }),
    );

    const principal = await service.resolvePrincipal('session-id', 'user-id');

    expect(principal.roles).toEqual([]);
    expect(principal.permissions).toEqual([]);
    expect(principal.maxRoleLevel).toBe(0);
  });

  it.each([
    ['inactive UserBranch', false, true],
    ['inactive Branch', true, false],
  ])(
    'excludes %s from allowed branches',
    async (_name, assignmentActive, branchActive) => {
      repository.findActiveSessionPrincipalSource.mockResolvedValue(
        source({
          userBranches: [
            {
              isPrimary: true,
              isActive: assignmentActive,
              branch: {
                id: 'branch-id',
                code: 'can-tho',
                name: 'Cần Thơ',
                isActive: branchActive,
              },
            },
          ],
        }),
      );

      const principal = await service.resolvePrincipal('session-id', 'user-id');

      expect(principal.allowedBranchIds).toEqual([]);
      expect(principal.primaryBranchId).toBeNull();
    },
  );

  it('deduplicates active branches and preserves the primary assignment', async () => {
    const branch = {
      id: 'branch-id',
      code: 'can-tho',
      name: 'Can Tho',
      isActive: true,
    };
    repository.findActiveSessionPrincipalSource.mockResolvedValue(
      source({
        userBranches: [
          { isPrimary: true, isActive: true, branch },
          { isPrimary: false, isActive: true, branch },
        ],
      }),
    );

    const principal = await service.resolvePrincipal('session-id', 'user-id');

    expect(principal.allowedBranchIds).toEqual(['branch-id']);
    expect(principal.branches).toEqual([
      { id: 'branch-id', code: 'can-tho', name: 'Can Tho', isPrimary: true },
    ]);
    expect(principal.primaryBranchId).toBe('branch-id');
  });

  it('returns all permission catalog entries for active SUPER_ADMIN and ignores overrides', async () => {
    repository.findActiveSessionPrincipalSource.mockResolvedValue(
      source({
        type: UserType.SYSTEM,
        userRoles: [
          userRole(
            role('super', 'SUPER_ADMIN', 100, [], true, UserType.SYSTEM),
          ),
        ],
        userPermissions: [userPermission('orders.read', PermissionEffect.DENY)],
      }),
    );
    repository.findAllPermissionCodes.mockResolvedValue([
      'orders.read',
      'users.read',
      'orders.read',
    ]);

    const principal = await service.resolvePrincipal('session-id', 'user-id');

    expect(principal.isSuperAdmin).toBe(true);
    expect(principal.permissions).toEqual(['orders.read', 'users.read']);
  });

  it('authenticates a user without roles with empty permissions and level zero', async () => {
    repository.findActiveSessionPrincipalSource.mockResolvedValue(source());

    const principal = await service.resolvePrincipal('session-id', 'user-id');

    expect(principal.roles).toEqual([]);
    expect(principal.permissions).toEqual([]);
    expect(principal.maxRoleLevel).toBe(0);
    expect(principal.isSuperAdmin).toBe(false);
  });

  it('maps profile fields and serializes birthday as a date-only string', async () => {
    repository.findActiveSessionPrincipalSource.mockResolvedValue(
      source({
        phone: '0901234567',
        gender: 'female',
        birthday: new Date('1995-06-15T00:00:00.000Z'),
      }),
    );

    await expect(
      service.resolvePrincipal('session-id', 'user-id'),
    ).resolves.toEqual(
      expect.objectContaining({
        phone: '0901234567',
        gender: 'female',
        birthday: '1995-06-15',
      }),
    );
  });

  it('isolates roles, permissions, DENY and max level by branch', async () => {
    repository.findActiveSessionPrincipalSource.mockResolvedValue(
      source({
        userRoles: [
          userRole(
            role(
              'legacy',
              'SUPER_ADMIN',
              100,
              ['payments.create'],
              true,
              UserType.SYSTEM,
            ),
          ),
        ],
        userPermissions: [
          userPermission('payments.create', PermissionEffect.ALLOW),
        ],
        userBranches: [
          branchAssignment({
            id: 'ub-hg',
            branchId: 'hau-giang',
            role: role('staff', 'STAFF', 30, ['inventory.update']),
            permissions: [
              userPermission('inventory.update', PermissionEffect.ALLOW),
              userPermission('payments.create', PermissionEffect.DENY),
            ],
          }),
          branchAssignment({
            id: 'ub-ct',
            branchId: 'can-tho',
            role: role('cashier', 'CASHIER', 20, ['payments.create']),
            permissions: [
              userPermission('payments.create', PermissionEffect.ALLOW),
            ],
          }),
        ],
      }),
    );

    const principal = await service.resolvePrincipal('session-id', 'user-id');

    expect(principal.isSuperAdmin).toBe(false);
    expect(principal.globalRoles).toEqual([]);
    expect(principal.globalPermissions).toEqual([]);
    expect(principal.branchAssignments).toEqual([
      expect.objectContaining({
        branchId: 'hau-giang',
        userBranchId: 'ub-hg',
        permissions: ['inventory.update'],
        maxRoleLevel: 30,
      }),
      expect.objectContaining({
        branchId: 'can-tho',
        userBranchId: 'ub-ct',
        permissions: ['payments.create'],
        maxRoleLevel: 20,
      }),
    ]);
  });

  it('rejects missing sessions and inactive users', async () => {
    repository.findActiveSessionPrincipalSource.mockResolvedValue(null);

    await expect(
      service.resolvePrincipal('session-id', 'user-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    repository.findActiveSessionPrincipalSource.mockResolvedValue(
      source({ isActive: false }),
    );

    await expect(
      service.resolvePrincipal('session-id', 'user-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function source(overrides: Record<string, unknown> = {}) {
  const { type = UserType.BRANCH, ...relations } = overrides;
  return {
    id: 'session-id',
    user: {
      id: 'user-id',
      email: 'user@example.com',
      fullName: 'User',
      phone: null,
      gender: null,
      birthday: null,
      type,
      isActive: true,
      userRoles: [],
      userPermissions: [],
      userBranches: [],
      ...relations,
    },
  };
}

function role(
  id: string,
  code: string,
  level: number,
  permissions: string[],
  isActive = true,
  type: UserType = UserType.BRANCH,
) {
  return {
    id,
    code,
    level,
    type,
    isSystem: true,
    isActive,
    rolePermissions: permissions.map((permission) => ({
      permission: { code: permission },
    })),
  };
}

function userRole(targetRole: ReturnType<typeof role>) {
  return { role: targetRole };
}

function userPermission(code: string, effect: PermissionEffect) {
  return { effect, permission: { code } };
}

function branchAssignment(input: {
  id: string;
  branchId: string;
  role: ReturnType<typeof role>;
  permissions: ReturnType<typeof userPermission>[];
}) {
  return {
    id: input.id,
    branchId: input.branchId,
    isPrimary: input.branchId === 'hau-giang',
    isActive: true,
    branch: {
      id: input.branchId,
      code: input.branchId,
      name: input.branchId,
      isActive: true,
    },
    roles: [userRole(input.role)],
    permissions: input.permissions,
  };
}
