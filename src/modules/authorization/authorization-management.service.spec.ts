import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PermissionEffect, Prisma, UserType } from '@/generated/prisma/client';
import { SortDirection } from '@/common/enums';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AuthorizationManagementService } from './authorization-management.service';
import {
  AuthorizationWriteScopeError,
  AuthorizationWriteValidationError,
  StaffLastRoleRequiredError,
} from './authorization.repository';
import {
  BranchAdminSortField,
  StaffAssignableRoleAction,
  StaffSortField,
} from './dto';

describe('AuthorizationManagementService', () => {
  const transactionClient = {};
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
    assertStaffPermissionCodeIsDelegatable: jest.fn(),
  };
  let service: AuthorizationManagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findUserPolicySubject.mockResolvedValue({
      id: 'customer-id',
      type: UserType.CUSTOMER,
      isActive: true,
      userRoles: [],
      userBranches: [],
    });
    repository.findActiveBranchesByIds.mockImplementation((ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ id }))),
    );
    repository.transaction.mockImplementation(
      (callback: (client: Record<string, unknown>) => Promise<unknown>) =>
        callback(transactionClient),
    );
    repository.findActiveSystemRoleByCode.mockResolvedValue({
      id: 'super-admin-role-id',
    });
    service = new AuthorizationManagementService(
      repository as never,
      branchContext as never,
      rolePolicy as never,
      systemPolicy as never,
      permissionPolicy as never,
    );
  });

  it('normalizes and forwards the complete server-side role query', async () => {
    repository.listRoles.mockResolvedValue([[], 0]);

    await service.listRoles({
      page: 2,
      limit: 25,
      search: '  sales  ',
      type: UserType.BRANCH,
      isActive: false,
      isSystem: false,
      guardName: 'web',
      levelFrom: 10,
      levelTo: 30,
      createdFrom: '2026-07-01',
      createdTo: '2026-07-02',
    });

    expect(repository.listRoles).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 25,
        take: 25,
        search: 'sales',
        type: UserType.BRANCH,
        isActive: false,
        isSystem: false,
        guardName: 'web',
        levelFrom: 10,
        levelTo: 30,
        createdFrom: new Date('2026-06-30T17:00:00.000Z'),
        createdTo: new Date('2026-07-02T17:00:00.000Z'),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
    );
  });

  it.each([
    [StaffAssignableRoleAction.CREATE, 'staff.create'],
    [StaffAssignableRoleAction.ASSIGN, 'staff.assign_role'],
  ])(
    'returns only delegatable Staff roles for %s without roles.read',
    async (action, permission) => {
      repository.listAssignableStaffRoles.mockResolvedValue([[], 0]);
      branchContext.requireSelectedBranch.mockReturnValue('branch-id');
      const principal = branchAdmin({
        permissions: [permission],
        maxRoleLevel: 70,
      });

      await service.listAssignableStaffRoles(
        principal,
        {
          scope: 'SELECTED',
          selectedBranchId: 'branch-id',
          allowedBranchIds: ['branch-id'],
        },
        { action, page: 1, limit: 100, search: '  staff  ' },
      );

      expect(repository.listAssignableStaffRoles).toHaveBeenCalledWith({
        skip: 0,
        take: 100,
        search: 'staff',
        maxRoleLevel: 70,
      });
    },
  );

  it('rejects the assignable Staff role catalog without the action capability', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');

    await expect(
      service.listAssignableStaffRoles(
        branchAdmin({ permissions: [] }),
        {
          scope: 'SELECTED',
          selectedBranchId: 'branch-id',
          allowedBranchIds: ['branch-id'],
        },
        { action: StaffAssignableRoleAction.ASSIGN },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.listAssignableStaffRoles).not.toHaveBeenCalled();
  });

  it('returns the actor-aware Staff permission catalog without permissions.read', async () => {
    repository.listAssignableStaffPermissions.mockResolvedValue([[], 0]);
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');

    await service.listAssignableStaffPermissions(
      branchAdmin({
        permissions: ['staff.assign_permission', 'orders.read', 'roles.read'],
      }),
      {
        scope: 'SELECTED',
        selectedBranchId: 'branch-id',
        allowedBranchIds: ['branch-id'],
      },
      { page: 1, limit: 100, search: '  order  ' },
    );

    expect(repository.listAssignableStaffPermissions).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
        search: 'order',
        actorPermissionCodes: [
          'staff.assign_permission',
          'orders.read',
          'roles.read',
        ],
      }),
    );
  });

  it('rejects the Staff permission catalog without staff.assign_permission', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');

    await expect(
      service.listAssignableStaffPermissions(
        branchAdmin({ permissions: ['orders.read'] }),
        {
          scope: 'SELECTED',
          selectedBranchId: 'branch-id',
          allowedBranchIds: ['branch-id'],
        },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
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

  it('normalizes and forwards the complete server-side permission query', async () => {
    repository.listPermissions.mockResolvedValue([[], 0]);

    await service.listPermissions({
      page: 2,
      limit: 25,
      search: '  role  ',
      resource: 'roles',
      action: 'read',
      guardName: 'web',
      createdFrom: '2026-07-01',
      createdTo: '2026-07-02',
    });

    expect(repository.listPermissions).toHaveBeenCalledWith({
      skip: 25,
      take: 25,
      search: 'role',
      resource: 'roles',
      action: 'read',
      guardName: 'web',
      createdFrom: new Date('2026-06-30T17:00:00.000Z'),
      createdTo: new Date('2026-07-02T17:00:00.000Z'),
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('creates a consistent permission with the default web guard and null description', async () => {
    const created = {
      id: 'permission-id',
      code: 'shipments.read',
      name: 'Xem vận chuyển',
      resource: 'shipments',
      action: 'read',
      guardName: 'web',
      description: null,
    };
    repository.createPermission.mockResolvedValue(created);

    await expect(
      service.createPermission(superAdmin(), {
        code: 'shipments.read',
        name: 'Xem vận chuyển',
        resource: 'shipments',
        action: 'read',
        description: null,
      }),
    ).resolves.toEqual(created);
    expect(repository.createPermission).toHaveBeenCalledWith(
      {
        code: 'shipments.read',
        name: 'Xem vận chuyển',
        resource: 'shipments',
        action: 'read',
        guardName: 'web',
        description: null,
      },
      transactionClient,
    );
    expect(repository.findActiveSystemRoleByCode).toHaveBeenCalledWith(
      'SUPER_ADMIN',
      transactionClient,
    );
    expect(repository.assignRolePermission).toHaveBeenCalledWith(
      'super-admin-role-id',
      'permission-id',
      transactionClient,
    );
  });

  it('rejects create when code does not match resource.action', () => {
    expect(() =>
      service.createPermission(superAdmin(), {
        code: 'test.test',
        name: 'Thực hiện test',
        resource: 'test',
        action: 'create',
      }),
    ).toThrow(BadRequestException);
    expect(repository.createPermission).not.toHaveBeenCalled();
  });

  it('prevents updating or deleting a dangerous permission', async () => {
    repository.findPermissionDetail.mockResolvedValue({
      id: 'permission-id',
      code: 'permissions.delete',
      resource: 'permissions',
      action: 'delete',
      _count: {
        rolePermissions: 0,
        userPermissions: 0,
        userBranchPermissions: 0,
      },
    });

    await expect(
      service.updatePermission(superAdmin(), 'permission-id', {
        name: 'Changed',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.deletePermission(superAdmin(), 'permission-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.updatePermission).not.toHaveBeenCalled();
    expect(repository.deletePermissionIfUnused).not.toHaveBeenCalled();
  });

  it('allows a description-only update for a referenced non-dangerous permission', async () => {
    const current = {
      id: 'permission-id',
      code: 'orders.read',
      name: 'Xem đơn hàng',
      resource: 'orders',
      action: 'read',
      guardName: 'web',
      description: 'Mô tả cũ',
      _count: {
        rolePermissions: 2,
        userPermissions: 1,
        userBranchPermissions: 0,
      },
    };
    repository.findPermissionDetail.mockResolvedValue(current);
    repository.updatePermission.mockResolvedValue({
      ...current,
      description: 'Mô tả mới',
    });

    await expect(
      service.updatePermission(superAdmin(), 'permission-id', {
        description: 'Mô tả mới',
      }),
    ).resolves.toMatchObject({ description: 'Mô tả mới' });
    expect(repository.updatePermission).toHaveBeenCalledWith('permission-id', {
      description: 'Mô tả mới',
    });
  });

  it('supports name-only, clear-description and empty partial updates', async () => {
    const current = {
      id: 'permission-id',
      code: 'orders.read_own',
      name: 'Xem đơn hàng của mình',
      resource: 'orders',
      action: 'read_own',
      guardName: 'web',
      description: 'Mô tả cũ',
      _count: {
        rolePermissions: 1,
        userPermissions: 0,
        userBranchPermissions: 0,
      },
    };
    repository.findPermissionDetail.mockResolvedValue(current);
    repository.updatePermission.mockImplementation(
      (_id: string, data: Record<string, unknown>) =>
        Promise.resolve({ ...current, ...data }),
    );

    await expect(
      service.updatePermission(superAdmin(), 'permission-id', {
        name: 'Tên mới',
      }),
    ).resolves.toMatchObject({ name: 'Tên mới' });
    await expect(
      service.updatePermission(superAdmin(), 'permission-id', {
        description: null,
      }),
    ).resolves.toMatchObject({ description: null });
    await expect(
      service.updatePermission(superAdmin(), 'permission-id', {}),
    ).resolves.toMatchObject(current);
    expect(repository.updatePermission).toHaveBeenNthCalledWith(
      2,
      'permission-id',
      { description: null },
    );
    expect(repository.updatePermission).toHaveBeenNthCalledWith(
      3,
      'permission-id',
      {},
    );
  });

  it('rejects an identity update that breaks code/resource/action consistency', async () => {
    repository.findPermissionDetail.mockResolvedValue({
      id: 'permission-id',
      code: 'orders.read_own',
      resource: 'orders',
      action: 'read_own',
      _count: {
        rolePermissions: 0,
        userPermissions: 0,
        userBranchPermissions: 0,
      },
    });

    await expect(
      service.updatePermission(superAdmin(), 'permission-id', {
        action: 'update',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updatePermission).not.toHaveBeenCalled();
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
    expect(repository.listBranches).toHaveBeenCalledWith(
      where,
      0,
      10,
      undefined,
      undefined,
      undefined,
      undefined,
      'code',
      'asc',
    );
  });

  it('trims branch search before passing it to the scoped repository query', async () => {
    const where = { scope: 'UNRESTRICTED' };
    branchContext.buildBranchWhere.mockReturnValue(where);
    repository.listBranches.mockResolvedValue([[], 0]);

    await service.listBranches(
      { scope: 'ALL', selectedBranchId: null, allowedBranchIds: null },
      { search: '  can tho  ' },
    );

    expect(repository.listBranches).toHaveBeenCalledWith(
      where,
      0,
      10,
      'can tho',
      undefined,
      undefined,
      undefined,
      'code',
      'asc',
    );
  });

  it('converts inclusive Vietnam date filters to a half-open UTC range', async () => {
    const where = { scope: 'UNRESTRICTED' };
    branchContext.buildBranchWhere.mockReturnValue(where);
    repository.listBranches.mockResolvedValue([[], 0]);

    await service.listBranches(
      { scope: 'ALL', selectedBranchId: null, allowedBranchIds: null },
      { createdFrom: '2026-06-27', createdTo: '2026-06-27' },
    );

    expect(repository.listBranches).toHaveBeenCalledWith(
      where,
      0,
      10,
      undefined,
      undefined,
      new Date('2026-06-26T17:00:00.000Z'),
      new Date('2026-06-27T17:00:00.000Z'),
      'code',
      'asc',
    );
  });

  it.each([
    { requested: undefined, expected: true },
    { requested: true, expected: true },
    { requested: false, expected: false },
  ])(
    'creates a branch with status $expected when requested is $requested',
    async ({ requested, expected }) => {
      repository.createBranch.mockResolvedValue({
        id: 'branch-id',
        isActive: expected,
      });

      await service.createBranch(superAdmin(), {
        code: 'ct-01',
        name: 'Cần Thơ',
        address: 'Ninh Kiều',
        ...(requested === undefined ? {} : { isActive: requested }),
      });

      expect(repository.createBranch).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: expected }),
      );
    },
  );

  it('passes profile and status changes to the atomic scoped repository write', async () => {
    const where = { scope: 'UNRESTRICTED' };
    branchContext.buildBranchWhere.mockReturnValue(where);
    repository.updateBranchInScope.mockResolvedValue({
      id: 'branch-id',
      name: 'Updated',
      isActive: false,
    });

    await service.updateBranch(
      superAdmin(),
      { scope: 'ALL', selectedBranchId: null, allowedBranchIds: null },
      'branch-id',
      { name: 'Updated', isActive: false },
    );

    expect(repository.updateBranchInScope).toHaveBeenCalledWith(
      'branch-id',
      where,
      { name: 'Updated', isActive: false },
    );
  });

  it('returns Branch coordinates as JSON numbers', async () => {
    branchContext.buildBranchWhere.mockReturnValue({ scope: 'UNRESTRICTED' });
    repository.listBranches.mockResolvedValue([
      [
        {
          id: 'branch-id',
          latitude: new Prisma.Decimal('10.0452000'),
          longitude: new Prisma.Decimal('105.7469000'),
        },
      ],
      1,
    ]);

    await expect(
      service.listBranches(
        { scope: 'ALL', selectedBranchId: null, allowedBranchIds: null },
        {},
      ),
    ).resolves.toMatchObject({
      data: [
        {
          id: 'branch-id',
          latitude: 10.0452,
          longitude: 105.7469,
        },
      ],
    });
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
    repository.findStaffInBranch.mockResolvedValue(staffAssignment());
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

  it('forwards Staff list filters and maps the selected assignment', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');
    repository.listStaff.mockResolvedValue([[staffAssignment()], 1]);

    const result = await service.listStaff({} as never, {
      page: 2,
      limit: 10,
      search: '  cashier  ',
      sortBy: StaffSortField.ASSIGNED_AT,
      sortOrder: SortDirection.ASC,
      userIsActive: true,
      assignmentIsActive: false,
      isPrimary: false,
      roleId: 'role-id',
    });

    expect(repository.listStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch-id',
        skip: 10,
        take: 10,
        search: 'cashier',
        userIsActive: true,
        assignmentIsActive: false,
        isPrimary: false,
        roleId: 'role-id',
      }),
    );
    expect(result.data[0]).toMatchObject({
      id: 'staff-id',
      assignment: { id: 'assignment-id', roles: [{ code: 'CASHIER' }] },
    });
  });

  it('assigns an existing BRANCH user only after delegation checks', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');
    repository.assignExistingStaff.mockResolvedValue(staffAssignment());

    await service.assignExistingStaff(superAdmin(), {} as never, 'staff-id', {
      roleIds: ['role-id'],
      permissionIds: ['permission-id'],
    });

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
    expect(repository.assignExistingStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'staff-id',
        branchId: 'branch-id',
        roleIds: ['role-id'],
      }),
    );
  });

  it('allows only Super Admin to list candidates and assign existing Staff', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');
    repository.listStaffCandidates.mockResolvedValue([[], 0]);

    await service.listStaffCandidates(superAdmin(), {} as never, {
      page: 1,
      limit: 10,
    });
    expect(repository.listStaffCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-id' }),
    );

    await expect(
      service.listStaffCandidates(branchAdmin(), {} as never, {
        page: 1,
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assignExistingStaff(branchAdmin(), {} as never, 'staff-id', {
        roleIds: ['role-id'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects Branch Admin management by a non-Super Admin', async () => {
    await expect(
      service.listBranchAdmins(branchAdmin(), {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes Branch Admin current/candidate filters to one server-side query', async () => {
    repository.listManagedUsers.mockResolvedValue([[], 0]);

    await service.listBranchAdmins(superAdmin(), {
      page: 2,
      limit: 20,
      search: '  manager  ',
      excludeAssignedBranchId: '01JZ0000000000000000000001',
      isActive: true,
      sortBy: BranchAdminSortField.FULL_NAME,
      sortOrder: SortDirection.ASC,
    });

    expect(repository.listManagedUsers).toHaveBeenCalledWith(
      'BRANCH_ADMIN',
      { scope: 'UNRESTRICTED' },
      20,
      20,
      'manager',
      {
        assignedBranchId: undefined,
        excludeAssignedBranchId: '01JZ0000000000000000000001',
        isActive: true,
        assignmentIsActive: undefined,
        assignmentState: undefined,
      },
      'fullName',
      'asc',
    );
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

  it('passes assignment kind into the atomic branch removal', async () => {
    repository.removeUserBranch.mockResolvedValue({ count: 1 });

    await service.removeUserBranch(
      superAdmin(),
      'staff-id',
      'branch-a',
      'STAFF',
      'branch-b',
    );

    expect(repository.removeUserBranch).toHaveBeenCalledWith(
      'staff-id',
      'branch-a',
      'STAFF',
      'branch-b',
    );
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

  it('rejects a non-web role before assigning it to Staff', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');
    repository.findActiveUserBranchPolicySubject.mockResolvedValue({
      id: 'user-branch-id',
      roles: [{ role: { level: 10 } }],
    });
    repository.findRolePolicySubject.mockResolvedValue({
      id: 'role-id',
      code: 'API_STAFF',
      type: UserType.BRANCH,
      guardName: 'api',
      level: 10,
      isActive: true,
    });

    await expect(
      service.assignUserRole(superAdmin(), {} as never, 'staff-id', 'role-id'),
    ).rejects.toMatchObject({ status: 400 });

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

  it.each([PermissionEffect.ALLOW, PermissionEffect.DENY])(
    'blocks dangerous %s overrides before Customer to Staff conversion writes',
    async (effect) => {
      permissionPolicy.assertCanAssignInitialPermission.mockRejectedValue(
        new ForbiddenException('dangerous'),
      );

      await expect(
        service.convertToStaff(superAdmin(), 'customer-id', {
          branchAssignments: [
            {
              branchId: 'branch-id',
              isPrimary: true,
              roleIds: ['role-id'],
              permissions: [{ permissionId: 'dangerous-id', effect }],
            },
          ],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.convertCustomerToStaff).not.toHaveBeenCalled();
    },
  );

  it('converts a Customer with a non-dangerous override after policy validation', async () => {
    permissionPolicy.assertCanAssignInitialPermission.mockResolvedValue(
      undefined,
    );
    repository.convertCustomerToStaff.mockResolvedValue({ id: 'customer-id' });

    await service.convertToStaff(superAdmin(), 'customer-id', {
      branchAssignments: [
        {
          branchId: 'branch-id',
          isPrimary: true,
          roleIds: ['role-id'],
          permissions: [
            { permissionId: 'orders-read-id', effect: PermissionEffect.ALLOW },
          ],
        },
      ],
    });

    expect(
      permissionPolicy.assertCanAssignInitialPermission,
    ).toHaveBeenCalledWith(
      expect.anything(),
      'orders-read-id',
      PermissionEffect.ALLOW,
    );
    expect(repository.convertCustomerToStaff).toHaveBeenCalled();
  });

  it('returns a stable conflict code when removing the last Staff role', async () => {
    branchContext.requireSelectedBranch.mockReturnValue('branch-id');
    repository.findActiveUserBranchPolicySubject.mockResolvedValue({
      id: 'user-branch-id',
      roles: [{ role: { level: 10 } }],
    });
    repository.findRolePolicySubject.mockResolvedValue({
      id: 'role-id',
      type: UserType.BRANCH,
      code: 'STAFF',
      level: 10,
    });
    repository.removeUserRole.mockRejectedValue(
      new StaffLastRoleRequiredError('last role'),
    );

    await expect(
      service.removeUserRole(superAdmin(), {} as never, 'staff-id', 'role-id'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STAFF_LAST_ROLE_REQUIRED' }),
    });
  });

  it('returns all Staff assignments only to Super Admin', async () => {
    repository.findStaffAssignments.mockResolvedValue({
      id: 'staff-id',
      birthday: new Date('1995-08-17T00:00:00.000Z'),
      userBranches: [{ id: 'assignment-id' }],
    });

    await expect(
      service.getStaffAssignments(superAdmin(), 'staff-id'),
    ).resolves.toMatchObject({
      user: { birthday: '1995-08-17' },
      assignments: [{ id: 'assignment-id' }],
    });
    await expect(
      service.getStaffAssignments(branchAdmin(), 'staff-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function staffAssignment() {
  return {
    id: 'assignment-id',
    branchId: 'branch-id',
    isPrimary: true,
    isActive: true,
    assignedBy: 'actor-id',
    assignedAt: new Date('2026-07-18T00:00:00.000Z'),
    branch: {
      id: 'branch-id',
      code: 'can-tho',
      name: 'Cần Thơ',
      isActive: true,
    },
    roles: [
      {
        role: {
          id: 'role-id',
          code: 'CASHIER',
          name: 'Thu ngân',
          guardName: 'web',
          type: UserType.BRANCH,
          level: 10,
          isSystem: false,
          isActive: true,
          rolePermissions: [],
        },
      },
    ],
    permissions: [],
    user: {
      id: 'staff-id',
      email: 'staff@example.com',
      fullName: 'Staff',
      phone: '0900000000',
      isActive: true,
      createdAt: new Date('2026-07-17T00:00:00.000Z'),
    },
  };
}

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
