import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PermissionEffect, UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AuthorizationManagementService } from './authorization-management.service';
import {
  AuthorizationWriteScopeError,
  AuthorizationWriteValidationError,
} from './authorization.repository';

describe('AuthorizationManagementService', () => {
  const repository = new Proxy<Record<string, jest.Mock>>(
    {},
    {
      get(target, property: string) {
        target[property] ??= jest.fn();
        return target[property];
      },
    },
  );
  const branchContext = {
    buildBranchWhere: jest.fn(),
    requireSelectedBranch: jest.fn(),
    assertBranchAccess: jest.fn(),
  };
  const rolePolicy = {
    assertCanAssignRoleToNewBranchUser: jest.fn(),
    assertCanManageExistingUser: jest.fn(),
    assertCanManageExistingBranchUser: jest.fn(),
    assertCanAssignRole: jest.fn(),
  };
  const systemPolicy = {
    assertCanCreateRole: jest.fn(),
    assertCanUpdateRole: jest.fn(),
    assertCanDeleteRole: jest.fn(),
    assertCanDeactivateSuperAdminRole: jest.fn(),
    assertCanCreatePermission: jest.fn(),
    assertCanUpdatePermission: jest.fn(),
    assertCanDeletePermission: jest.fn(),
    assertCanRemoveSuperAdmin: jest.fn(),
  };
  const permissionPolicy = {
    assertCanAssignRolePermission: jest.fn(),
    assertCanRemoveRolePermission: jest.fn(),
    assertCanAssignInitialPermission: jest.fn(),
    assertCanAssignUserPermission: jest.fn(),
  };
  let service: AuthorizationManagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.transaction.mockImplementation(
      (callback: (client: Record<string, unknown>) => Promise<unknown>) =>
        callback({}),
    );
    service = new AuthorizationManagementService(
      repository as never,
      branchContext as never,
      rolePolicy as never,
      systemPolicy as never,
      permissionPolicy as never,
    );
  });

  it('creates only a custom role after system policy approval', async () => {
    repository.createRole.mockResolvedValue({ id: 'role-id' });
    await service.createRole(superAdmin(), {
      code: 'SALES',
      name: 'Sales',
      type: UserType.BRANCH,
      level: 20,
    });
    expect(systemPolicy.assertCanCreateRole).toHaveBeenCalled();
    expect(repository.createRole).toHaveBeenCalledWith(
      expect.objectContaining({
        isSystem: false,
        isActive: true,
        guardName: 'web',
      }),
    );
  });

  it('prevents deletion of a referenced permission', async () => {
    repository.findPermissionDetail.mockResolvedValue({
      id: 'permission-id',
      code: 'orders.read',
      resource: 'orders',
      action: 'read',
      _count: { rolePermissions: 1, userPermissions: 0 },
    });
    await expect(
      service.deletePermission(superAdmin(), 'permission-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.deletePermissionIfUnused).not.toHaveBeenCalled();
  });

  it('returns conflict when a permission becomes referenced before delete', async () => {
    repository.findPermissionDetail.mockResolvedValue({
      id: 'permission-id',
      code: 'orders.read',
      resource: 'orders',
      action: 'read',
      _count: { rolePermissions: 0, userPermissions: 0 },
    });
    repository.deletePermissionIfUnused.mockResolvedValue({ count: 0 });

    await expect(
      service.deletePermission(superAdmin(), 'permission-id'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('delegates role catalog denial to SystemProtectionPolicy', () => {
    systemPolicy.assertCanCreateRole.mockImplementationOnce(() => {
      throw new ForbiddenException();
    });

    expect(() =>
      service.createRole(branchAdmin(), {
        code: 'SALES',
        name: 'Sales',
        type: UserType.BRANCH,
        level: 20,
      }),
    ).toThrow(ForbiddenException);
    expect(repository.createRole).not.toHaveBeenCalled();
  });

  it('passes BranchContext filter to the branch repository', async () => {
    const where = {
      scope: 'FILTERED',
      where: { branchId: { in: ['branch-id'] } },
    };
    branchContext.buildBranchWhere.mockReturnValue(where);
    repository.listBranches.mockResolvedValue([[], 0]);
    await service.listBranches(
      {
        scope: 'ALLOWED_SET',
        selectedBranchId: null,
        allowedBranchIds: ['branch-id'],
      },
      { page: 1, limit: 10 },
    );
    expect(repository.listBranches).toHaveBeenCalledWith(where, 0, 10);
  });

  it('returns 404 when branch detail is outside repository scope', async () => {
    branchContext.buildBranchWhere.mockReturnValue({
      scope: 'FILTERED',
      where: { branchId: 'branch-id' },
    });
    repository.findBranchInScope.mockResolvedValue(null);
    await expect(
      service.getBranch(
        {
          scope: 'SELECTED',
          selectedBranchId: 'branch-id',
          allowedBranchIds: ['branch-id'],
        },
        'other-branch',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 before updating staff outside repository scope', async () => {
    branchContext.buildBranchWhere.mockReturnValue({
      scope: 'FILTERED',
      where: { branchId: 'branch-id' },
    });
    repository.updateManagedUserInScope.mockRejectedValue(
      new AuthorizationWriteScopeError('outside scope'),
    );

    await expect(
      service.updateStaff(
        branchAdmin(),
        {
          scope: 'SELECTED',
          selectedBranchId: 'branch-id',
          allowedBranchIds: ['branch-id'],
        },
        'outside-staff',
        { fullName: 'Updated' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.updateManagedUserInScope).toHaveBeenCalledWith(
      'outside-staff',
      { scope: 'FILTERED', where: { branchId: 'branch-id' } },
      { fullName: 'Updated' },
      expect.any(Function),
    );
  });

  it('uses the guarded branch deactivate flow instead of a generic update', async () => {
    branchContext.buildBranchWhere.mockReturnValue({
      scope: 'FILTERED',
      where: { branchId: 'branch-id' },
    });
    repository.deactivateBranchInScope.mockResolvedValue({
      id: 'branch-id',
      isActive: false,
    });

    await service.deactivateBranch(
      superAdmin(),
      {
        scope: 'SELECTED',
        selectedBranchId: 'branch-id',
        allowedBranchIds: ['branch-id'],
      },
      'branch-id',
    );

    expect(repository.deactivateBranchInScope).toHaveBeenCalledWith(
      'branch-id',
      { scope: 'FILTERED', where: { branchId: 'branch-id' } },
    );
    expect(repository.updateBranchInScope).not.toHaveBeenCalled();
  });

  it('validates roles and permissions before creating staff transactionally', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');
    repository.createInternalUser.mockResolvedValue({ id: 'staff-id' });
    await service.createStaff(
      branchAdmin(),
      {
        scope: 'SELECTED',
        selectedBranchId: 'branch-id',
        allowedBranchIds: ['branch-id'],
      },
      {
        email: 'staff@example.com',
        fullName: 'Staff',
        password: 'password123',
        roleIds: ['role-id'],
        permissionIds: ['permission-id'],
      },
    );
    expect(rolePolicy.assertCanAssignRoleToNewBranchUser).toHaveBeenCalledWith(
      expect.anything(),
      'role-id',
    );
    expect(
      permissionPolicy.assertCanAssignInitialPermission,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'permission-id',
      PermissionEffect.ALLOW,
    );
    expect(repository.createInternalUser).toHaveBeenCalledWith(
      expect.objectContaining({
        branchIds: ['branch-id'],
        type: UserType.BRANCH,
      }),
    );
  });

  it('rejects Branch Admin management by a non-Super Admin', async () => {
    await expect(
      service.listBranchAdmins(branchAdmin(), {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses permission policy and upsert for UserPermission', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');
    repository.findActiveUserBranchPolicySubject.mockResolvedValue({
      id: 'user-branch-id',
      roles: [],
    });
    repository.findPermissionPolicySubject.mockResolvedValue({
      id: 'permission-id',
      code: 'orders.read',
    });
    await service.upsertUserPermission(
      branchAdmin({ permissions: ['staff.assign_permission', 'orders.read'] }),
      {
        scope: 'SELECTED',
        selectedBranchId: 'branch-id',
        allowedBranchIds: ['branch-id'],
      },
      'staff-id',
      'permission-id',
      PermissionEffect.DENY,
    );
    expect(repository.findActiveUserBranchPolicySubject).toHaveBeenCalledWith(
      'staff-id',
      'branch-id',
      {},
    );
    expect(repository.upsertUserPermission).toHaveBeenCalledWith(
      'user-branch-id',
      'permission-id',
      PermissionEffect.DENY,
      'actor-id',
      {},
    );
  });

  it('checks last Super Admin protection inside the deactivate transaction', async () => {
    const tx = { role: { update: jest.fn() } };
    repository.findRoleDetail.mockResolvedValue({
      id: 'role-id',
      code: 'SUPER_ADMIN',
    });
    repository.transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    await service
      .deactivateRole(superAdmin(), 'role-id')
      .catch(() => undefined);

    expect(systemPolicy.assertCanDeactivateSuperAdminRole).toHaveBeenCalledWith(
      'role-id',
      tx,
    );
    expect(systemPolicy.assertCanDeleteRole).toHaveBeenCalledWith(
      expect.anything(),
      'role-id',
      tx,
    );
    expect(repository.updateRole).toHaveBeenCalledWith(
      'role-id',
      { isActive: false },
      tx,
    );
  });

  it('converts transaction revalidation races into a bad request', async () => {
    repository.findActiveBranchesByIds.mockResolvedValue([{ id: 'branch-id' }]);
    repository.findActiveRoleByCode.mockResolvedValue({ id: 'role-id' });
    repository.createInternalUser.mockRejectedValue(
      new AuthorizationWriteValidationError('changed'),
    );

    await expect(
      service.createBranchAdmin(superAdmin(), {
        email: 'admin@example.com',
        fullName: 'Admin',
        password: 'password123',
        branchIds: ['branch-id'],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('requires a distinct primary replacement when another active branch remains', async () => {
    repository.listUserBranchAssignments.mockResolvedValue([
      {
        branchId: 'branch-a',
        isPrimary: true,
        isActive: true,
        branch: { isActive: true },
      },
      {
        branchId: 'branch-b',
        isPrimary: false,
        isActive: true,
        branch: { isActive: true },
      },
    ]);

    await expect(
      service.removeUserBranch(
        superAdmin(),
        'staff-id',
        'branch-a',
        'branch-a',
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.removeUserBranch).not.toHaveBeenCalled();
  });

  it('does not assign an inactive branch', async () => {
    repository.findActiveBranchById.mockResolvedValue(null);

    await expect(
      service.assignUserBranch(
        superAdmin(),
        'staff-id',
        'inactive-branch',
        'STAFF',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.assignUserBranch).not.toHaveBeenCalled();
  });

  it('checks Super Admin before any staff branch assignment lookup', async () => {
    await expect(
      service.assignUserBranch(
        branchAdmin({
          permissions: ['staff.assign_branch'],
        }),
        'staff-id',
        'branch-id',
        'STAFF',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.findActiveBranchById).not.toHaveBeenCalled();
    expect(repository.assignUserBranch).not.toHaveBeenCalled();
  });

  it('checks Super Admin before transferring staff between branches', async () => {
    await expect(
      service.transferStaffBranch(
        branchAdmin({
          permissions: ['staff.assign_branch'],
        }),
        'staff-id',
        {
          fromBranchId: 'branch-a',
          toBranchId: 'branch-b',
          destinationRoleIds: ['role-id'],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.transferStaffBranch).not.toHaveBeenCalled();
  });

  it('rejects transfer to the same branch before writing', async () => {
    await expect(
      service.transferStaffBranch(superAdmin(), 'staff-id', {
        fromBranchId: 'branch-a',
        toBranchId: 'branch-a',
        destinationRoleIds: ['role-id'],
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(repository.transferStaffBranch).not.toHaveBeenCalled();
  });

  it('delegates valid staff transfer to the repository transaction', async () => {
    repository.transferStaffBranch.mockResolvedValue({ id: 'staff-id' });

    await service.transferStaffBranch(superAdmin(), 'staff-id', {
      fromBranchId: 'branch-a',
      toBranchId: 'branch-b',
      destinationRoleIds: ['role-id'],
    });

    expect(repository.transferStaffBranch).toHaveBeenCalledWith({
      userId: 'staff-id',
      fromBranchId: 'branch-a',
      toBranchId: 'branch-b',
      destinationRoleIds: ['role-id'],
      assignedBy: 'actor-id',
    });
  });

  it('blocks a Branch Admin before writing a cross-branch role assignment', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('can-tho');
    repository.findActiveUserBranchPolicySubject.mockResolvedValue(null);

    await expect(
      service.assignUserRole(
        branchAdmin({
          allowedBranchIds: ['hau-giang'],
          permissions: ['staff.assign_role'],
        }),
        {
          scope: 'SELECTED',
          selectedBranchId: 'can-tho',
          allowedBranchIds: ['hau-giang'],
        },
        'staff-id',
        'role-id',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.assignUserRole).not.toHaveBeenCalled();
  });

  it('rejects invalid Customer to Staff primary and duplicate branch requests before write', async () => {
    await expect(
      service.convertToStaff(superAdmin(), 'customer-id', {
        branchAssignments: [
          {
            branchId: 'branch-id',
            isPrimary: true,
            roleIds: ['role-id'],
          },
          {
            branchId: 'branch-id',
            isPrimary: false,
            roleIds: ['role-id'],
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      service.convertToStaff(superAdmin(), 'customer-id', {
        branchAssignments: [
          {
            branchId: 'branch-a',
            isPrimary: false,
            roleIds: ['role-id'],
          },
          {
            branchId: 'branch-b',
            isPrimary: false,
            roleIds: ['role-id'],
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(repository.convertCustomerToStaff).not.toHaveBeenCalled();
  });
});

function branchAdmin(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return actor({
    permissions: [
      'staff.create',
      'staff.assign_role',
      'staff.assign_permission',
    ],
    allowedBranchIds: ['branch-id'],
    maxRoleLevel: 70,
    ...overrides,
  });
}

function superAdmin(): AuthenticatedUser {
  return actor({
    type: UserType.SYSTEM,
    isSuperAdmin: true,
    maxRoleLevel: 100,
  });
}

function actor(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'actor-id',
    email: 'actor@example.com',
    fullName: 'Actor',
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
