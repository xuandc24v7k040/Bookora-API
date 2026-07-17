import { ForbiddenException } from '@nestjs/common';
import { PermissionEffect, UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { PermissionDelegationPolicy } from './permission-delegation.policy';
import { SystemProtectionPolicy } from './system-protection.policy';

describe('PermissionDelegationPolicy', () => {
  const repository = {
    findUserPolicySubject: jest.fn(),
    findPermissionPolicySubject: jest.fn(),
    findRolePolicySubject: jest.fn(),
  };
  let policy: PermissionDelegationPolicy;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findUserPolicySubject.mockResolvedValue(target());
    repository.findPermissionPolicySubject.mockResolvedValue(
      permission('orders.read'),
    );
    repository.findRolePolicySubject.mockResolvedValue(role());
    policy = new PermissionDelegationPolicy(repository as never);
  });

  it('rejects a dangerous direct permission delegated by Branch Admin', async () => {
    repository.findPermissionPolicySubject.mockResolvedValue(
      permission('branches.assign'),
    );

    await expect(
      policy.assertCanAssignUserPermission(
        branchAdmin(['branches.assign']),
        'target-id',
        'permission-id',
        PermissionEffect.ALLOW,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a dangerous direct permission even when delegated by Super Admin', async () => {
    repository.findPermissionPolicySubject.mockResolvedValue(
      permission('branches.assign'),
    );

    await expect(
      policy.assertCanAssignUserPermission(
        superAdmin(['branches.assign']),
        'target-id',
        'permission-id',
        PermissionEffect.ALLOW,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([PermissionEffect.ALLOW, PermissionEffect.DENY])(
    'rejects dangerous %s during initial Staff permission validation',
    async (effect) => {
      repository.findPermissionPolicySubject.mockResolvedValue(
        permission('branches.assign'),
      );

      await expect(
        policy.assertCanAssignInitialPermission(
          superAdmin(['branches.assign']),
          'permission-id',
          effect,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each([UserType.BRANCH, UserType.CUSTOMER])(
    'rejects dangerous permission mapping for a %s role',
    async (type) => {
      repository.findPermissionPolicySubject.mockResolvedValue(
        permission('roles.create'),
      );
      repository.findRolePolicySubject.mockResolvedValue(role(type));

      await expect(
        policy.assertCanAssignRolePermission(
          superAdmin(['roles.create']),
          'role-id',
          'permission-id',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(['assign', 'remove'] as const)(
    'rejects %s permission mappings for a system role',
    async (operation) => {
      repository.findRolePolicySubject.mockResolvedValue({
        ...role(UserType.SYSTEM),
        isSystem: true,
      });

      const assertion =
        operation === 'assign'
          ? policy.assertCanAssignRolePermission(
              superAdmin(['orders.read']),
              'role-id',
              'permission-id',
            )
          : policy.assertCanRemoveRolePermission(
              superAdmin(['orders.read']),
              'role-id',
              'permission-id',
            );

      await expect(assertion).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('rejects UserPermission overrides for an active Super Admin', async () => {
    repository.findUserPolicySubject.mockResolvedValue(
      target({ roleCode: 'SUPER_ADMIN', roleLevel: 100 }),
    );

    await expect(
      policy.assertCanAssignUserPermission(
        superAdmin(),
        'target-id',
        'permission-id',
        PermissionEffect.DENY,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows DENY to narrow a lower target after normal delegation checks', async () => {
    await expect(
      policy.assertCanAssignUserPermission(
        branchAdmin(['orders.read']),
        'target-id',
        'permission-id',
        PermissionEffect.DENY,
      ),
    ).resolves.toBeUndefined();
  });
});

describe('SystemProtectionPolicy', () => {
  const repository = {
    findRolePolicySubject: jest.fn(),
    isActiveSuperAdmin: jest.fn(),
    countActiveSuperAdmins: jest.fn(),
  };
  let policy: SystemProtectionPolicy;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findRolePolicySubject.mockResolvedValue({
      ...role(UserType.SYSTEM),
      code: 'SUPER_ADMIN',
      isSystem: true,
    });
    policy = new SystemProtectionPolicy(repository as never);
  });

  it('prevents physical deletion of a system role', async () => {
    await expect(
      policy.assertCanDeleteRole(superAdmin(['roles.delete']), 'role-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents protected system role fields from being changed', async () => {
    await expect(
      policy.assertCanUpdateRole(superAdmin(['roles.update']), 'role-id', {
        code: 'RENAMED',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents Branch Admin from changing the permission catalog', () => {
    expect(() => policy.assertCanCreatePermission(branchAdmin())).toThrow(
      ForbiddenException,
    );
    expect(() => policy.assertCanUpdatePermission(branchAdmin())).toThrow(
      ForbiddenException,
    );
    expect(() => policy.assertCanDeletePermission(branchAdmin())).toThrow(
      ForbiddenException,
    );
  });

  it('protects the last active Super Admin using transaction-scoped queries', async () => {
    const transaction = { user: {}, role: {} };
    repository.isActiveSuperAdmin.mockResolvedValue({ id: 'target-id' });
    repository.countActiveSuperAdmins.mockResolvedValue(1);

    await expect(
      policy.assertCanRemoveSuperAdmin('target-id', transaction as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.isActiveSuperAdmin).toHaveBeenCalledWith(
      'target-id',
      transaction,
    );
    expect(repository.countActiveSuperAdmins).toHaveBeenCalledWith(transaction);
  });

  it('allows changes when another active Super Admin remains', async () => {
    repository.isActiveSuperAdmin.mockResolvedValue({ id: 'target-id' });
    repository.countActiveSuperAdmins.mockResolvedValue(2);

    await expect(
      policy.assertCanRemoveSuperAdmin('target-id'),
    ).resolves.toBeUndefined();
  });
});

function branchAdmin(extraPermissions: string[] = []): AuthenticatedUser {
  return actor({
    permissions: ['staff.assign_permission', ...extraPermissions],
    allowedBranchIds: ['branch-id'],
    maxRoleLevel: 70,
  });
}

function superAdmin(permissions: string[] = []): AuthenticatedUser {
  return actor({
    type: UserType.SYSTEM,
    permissions,
    maxRoleLevel: 100,
    isSuperAdmin: true,
  });
}

function actor(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'actor-id',
    email: 'actor@example.com',
    fullName: 'Actor',
    phone: null,
    gender: null,
    birthday: null,
    type: UserType.BRANCH,
    roles: [],
    permissions: [],
    globalRoles: [],
    globalPermissions: [],
    branchAssignments: [],
    allowedBranchIds: [],
    branches: [],
    primaryBranchId: null,
    maxRoleLevel: 0,
    isSuperAdmin: false,
    sessionId: 'session-id',
    ...overrides,
  };
}

function target(overrides: { roleCode?: string; roleLevel?: number } = {}) {
  return {
    id: 'target-id',
    type: UserType.BRANCH,
    isActive: true,
    userRoles: [
      {
        role: {
          id: 'target-role',
          code: overrides.roleCode ?? 'CASHIER',
          level: overrides.roleLevel ?? 20,
          type: UserType.BRANCH,
          isSystem: true,
          isActive: true,
        },
      },
    ],
    userBranches: [{ branchId: 'branch-id' }],
  };
}

function permission(code: string) {
  return { id: 'permission-id', code, guardName: 'web' };
}

function role(type: UserType = UserType.BRANCH) {
  return {
    id: 'role-id',
    code: 'STAFF',
    type,
    level: 30,
    guardName: 'web',
    isSystem: false,
    isActive: true,
  };
}
