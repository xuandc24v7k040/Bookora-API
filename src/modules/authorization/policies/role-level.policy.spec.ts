import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { RoleLevelPolicy } from './role-level.policy';

const ACTOR_BRANCH_ID = '01JZ0000000000000000000100';

describe('RoleLevelPolicy', () => {
  const repository = {
    findUserPolicySubject: jest.fn(),
    findRolePolicySubject: jest.fn(),
  };
  let policy: RoleLevelPolicy;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findUserPolicySubject.mockResolvedValue(target());
    policy = new RoleLevelPolicy(repository as never);
  });

  it.each([
    ['CASHIER', 20],
    ['INVENTORY', 30],
  ])(
    'allows Branch Admin to assign %s from database state',
    async (code, level) => {
      repository.findRolePolicySubject.mockResolvedValue(role(code, level));

      await expect(
        policy.assertCanAssignRole(branchAdmin(), 'target-id', 'role-id'),
      ).resolves.toBeUndefined();
      expect(repository.findRolePolicySubject).toHaveBeenCalledWith(
        'role-id',
        undefined,
      );
      expect(repository.findUserPolicySubject).toHaveBeenCalledWith(
        'target-id',
        undefined,
      );
    },
  );

  it.each([
    ['BRANCH_ADMIN', 70],
    ['SUPER_ADMIN', 100],
  ])('prevents Branch Admin assigning %s', async (code, level) => {
    if (code === 'SUPER_ADMIN') {
      repository.findUserPolicySubject.mockResolvedValue(
        target({ type: UserType.SYSTEM }),
      );
    }
    repository.findRolePolicySubject.mockResolvedValue(
      role(
        code,
        level,
        code === 'SUPER_ADMIN' ? UserType.SYSTEM : UserType.BRANCH,
      ),
    );

    await expect(
      policy.assertCanAssignRole(branchAdmin(), 'target-id', 'role-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents managing a target with an equal role level', async () => {
    repository.findUserPolicySubject.mockResolvedValue(
      target({ roleCode: 'BRANCH_ADMIN', roleLevel: 70 }),
    );
    repository.findRolePolicySubject.mockResolvedValue(role('CASHIER', 20));

    await expect(
      policy.assertCanAssignRole(branchAdmin(), 'target-id', 'role-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows managing a lower target in an intersecting active branch', async () => {
    repository.findRolePolicySubject.mockResolvedValue(role('CASHIER', 20));

    await expect(
      policy.assertCanManageExistingUser(branchAdmin(), 'target-id'),
    ).resolves.toBeUndefined();
  });

  it('rejects a target outside actor branch scope', async () => {
    repository.findUserPolicySubject.mockResolvedValue(
      target({ branchId: '01JZ0000000000000000000999' }),
    );

    await expect(
      policy.assertCanManageExistingUser(branchAdmin(), 'target-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an inactive role loaded from database', async () => {
    repository.findRolePolicySubject.mockResolvedValue(
      role('CASHIER', 20, UserType.BRANCH, false),
    );

    await expect(
      policy.assertCanAssignRole(branchAdmin(), 'target-id', 'role-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a role whose type differs from the target UserType', async () => {
    repository.findRolePolicySubject.mockResolvedValue(
      role('CUSTOMER', 10, UserType.CUSTOMER),
    );

    await expect(
      policy.assertCanAssignRole(branchAdmin(), 'target-id', 'role-id'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows an active Super Admin with super_admin.assign to assign SUPER_ADMIN', async () => {
    repository.findUserPolicySubject.mockResolvedValue(
      target({ type: UserType.SYSTEM, branchId: null }),
    );
    repository.findRolePolicySubject.mockResolvedValue(
      role('SUPER_ADMIN', 100, UserType.SYSTEM),
    );

    await expect(
      policy.assertCanAssignRole(superAdmin(), 'target-id', 'role-id'),
    ).resolves.toBeUndefined();
  });

  it('does not allow the Staff creation flow to assign BRANCH_ADMIN even for Super Admin', async () => {
    repository.findRolePolicySubject.mockResolvedValue(
      role('BRANCH_ADMIN', 70, UserType.BRANCH),
    );

    await expect(
      policy.assertCanAssignRoleToNewBranchUser(superAdmin(), 'role-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function branchAdmin(): AuthenticatedUser {
  return actor({
    roles: [
      {
        id: 'branch-admin-role',
        code: 'BRANCH_ADMIN',
        level: 70,
        type: UserType.BRANCH,
        isSystem: true,
      },
    ],
    permissions: ['staff.assign_role'],
    allowedBranchIds: [ACTOR_BRANCH_ID],
    maxRoleLevel: 70,
  });
}

function superAdmin(): AuthenticatedUser {
  return actor({
    type: UserType.SYSTEM,
    permissions: ['super_admin.assign'],
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

function target(
  overrides: {
    type?: UserType;
    roleCode?: string;
    roleLevel?: number;
    branchId?: string | null;
  } = {},
) {
  const roleCode = overrides.roleCode ?? 'CASHIER';
  const roleLevel = overrides.roleLevel ?? 20;
  const branchId =
    overrides.branchId === undefined ? ACTOR_BRANCH_ID : overrides.branchId;
  return {
    id: 'target-id',
    type: overrides.type ?? UserType.BRANCH,
    isActive: true,
    userRoles: roleCode
      ? [
          {
            role: {
              id: 'target-role',
              code: roleCode,
              level: roleLevel,
              type: overrides.type ?? UserType.BRANCH,
              isSystem: true,
              isActive: true,
            },
          },
        ]
      : [],
    userBranches: branchId ? [{ branchId }] : [],
  };
}

function role(
  code: string,
  level: number,
  type: UserType = UserType.BRANCH,
  isActive = true,
) {
  return {
    id: 'role-id',
    code,
    type,
    level,
    guardName: 'web',
    isSystem: true,
    isActive,
  };
}
