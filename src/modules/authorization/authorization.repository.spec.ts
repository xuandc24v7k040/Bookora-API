import { ConflictException } from '@nestjs/common';
import { PermissionEffect, Prisma, UserType } from '@/generated/prisma/client';
import {
  AuthorizationRepository,
  AuthorizationWriteScopeError,
} from './authorization.repository';
import {
  BranchAdminAssignmentState,
  BranchAdminSortField,
  BranchSortField,
  StaffSortField,
} from './dto';

describe('AuthorizationRepository principal profile query', () => {
  const prisma = {
    authSession: { findFirst: jest.fn() },
  };
  const repository = new AuthorizationRepository(prisma as never);

  it('selects phone, gender and birthday for the authenticated principal', async () => {
    prisma.authSession.findFirst.mockResolvedValue(null);

    await repository.findActiveSessionPrincipalSource('session-id', 'user-id');

    expect(
      prisma.authSession.findFirst.mock.calls[0][0].select.user.select,
    ).toEqual(
      expect.objectContaining({
        phone: true,
        gender: true,
        birthday: true,
      }),
    );
  });
});

describe('AuthorizationRepository system protection queries', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  };
  const repository = new AuthorizationRepository(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('defines active Super Admin through active User, UserRole and active Role', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-id' });

    await repository.isActiveSuperAdmin('user-id', prisma as never);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'user-id',
        isActive: true,
        userRoles: {
          some: { role: { code: 'SUPER_ADMIN', isActive: true } },
        },
      },
      select: { id: true },
    });
  });

  it('counts active Super Admins through the transaction client', async () => {
    prisma.user.count.mockResolvedValue(1);

    await repository.countActiveSuperAdmins(prisma as never);

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        isActive: true,
        userRoles: {
          some: { role: { code: 'SUPER_ADMIN', isActive: true } },
        },
      },
    });
  });
});

describe('AuthorizationRepository branch enforcement', () => {
  const prisma = {
    branch: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    user: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
  };
  const repository = new AuthorizationRepository(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.branch.findMany.mockResolvedValue([]);
    prisma.branch.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
  });

  it('filters branch list at the Prisma query', async () => {
    await repository.listBranches(
      { scope: 'FILTERED', where: { branchId: { in: ['branch-id'] } } },
      0,
      10,
      undefined,
      undefined,
      undefined,
      undefined,
      BranchSortField.CODE,
      'asc',
    );

    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ id: { in: ['branch-id'] } }] },
      }),
    );
  });

  it('composes case-insensitive branch search with scope for data and count', async () => {
    await repository.listBranches(
      { scope: 'FILTERED', where: { branchId: { in: ['branch-id'] } } },
      0,
      10,
      'CAN',
      false,
      undefined,
      undefined,
      BranchSortField.CREATED_AT,
      'desc',
    );

    const where = {
      AND: [
        { id: { in: ['branch-id'] } },
        {
          OR: [
            { code: { contains: 'CAN', mode: 'insensitive' } },
            { name: { contains: 'CAN', mode: 'insensitive' } },
          ],
        },
        { isActive: false },
      ],
    };
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(prisma.branch.count).toHaveBeenCalledWith({ where });
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('uses the same created-at range for branch data and count', async () => {
    const createdFrom = new Date('2026-06-01T00:00:00.000Z');
    const createdToExclusive = new Date('2026-07-01T00:00:00.000Z');

    await repository.listBranches(
      { scope: 'UNRESTRICTED' },
      0,
      10,
      undefined,
      true,
      createdFrom,
      createdToExclusive,
      BranchSortField.CREATED_AT,
      'desc',
    );

    const where = {
      AND: [
        {},
        { isActive: true },
        { createdAt: { gte: createdFrom, lt: createdToExclusive } },
      ],
    };
    expect(prisma.branch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(prisma.branch.count).toHaveBeenCalledWith({ where });
  });

  it('loads all Staff assignments without a selected-branch filter or secrets', async () => {
    await repository.findStaffAssignments('staff-id');

    const query = prisma.user.findFirst.mock.calls[0][0];
    expect(query).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'staff-id',
          type: UserType.BRANCH,
        }),
        select: expect.objectContaining({
          userBranches: expect.objectContaining({
            orderBy: [
              { isPrimary: 'desc' },
              { isActive: 'desc' },
              { branch: { code: 'asc' } },
              { id: 'asc' },
            ],
          }),
        }),
      }),
    );
    expect(query.select).not.toHaveProperty('passwordHash');
  });

  it('filters staff through active UserBranch and active Branch', async () => {
    await repository.listManagedUsers(
      'STAFF',
      { scope: 'FILTERED', where: { branchId: 'branch-id' } },
      0,
      10,
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userBranches: {
            some: expect.objectContaining({
              branchId: 'branch-id',
              isActive: true,
              branch: { isActive: true },
            }),
          },
        }),
      }),
    );
    expect(
      prisma.user.findMany.mock.calls[0][0].select.userBranches.where,
    ).toEqual({ branchId: 'branch-id' });
  });

  it('keeps an empty branch scope as an explicit empty Prisma filter', async () => {
    await repository.listManagedUsers(
      'STAFF',
      { scope: 'FILTERED', where: { branchId: { in: [] } } },
      0,
      10,
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userBranches: {
            some: expect.objectContaining({ branchId: { in: [] } }),
          },
        }),
      }),
    );
  });

  it('filters Branch Admin candidates server-side using the identity marker', async () => {
    await repository.listManagedUsers(
      'BRANCH_ADMIN',
      { scope: 'UNRESTRICTED' },
      0,
      10,
      '  admin@example.com  '.trim(),
      {
        excludeAssignedBranchId: 'branch-id',
        isActive: true,
      },
    );

    const findWhere = prisma.user.findMany.mock.calls[0][0].where;
    const countWhere = prisma.user.count.mock.calls[0][0].where;
    expect(findWhere).toEqual(countWhere);
    expect(findWhere).toEqual(
      expect.objectContaining({
        type: UserType.BRANCH,
        isActive: true,
        userRoles: {
          some: {
            role: expect.objectContaining({ code: 'BRANCH_ADMIN' }),
          },
        },
        userBranches: {
          none: expect.objectContaining({ branchId: 'branch-id' }),
        },
      }),
    );
    expect(findWhere).not.toHaveProperty('AND');
    expect(findWhere.userRoles).toBeDefined();
    expect(
      prisma.user.findMany.mock.calls[0][0].select.userBranches.where,
    ).toEqual(expect.objectContaining({ roles: expect.any(Object) }));
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('loads every assignment in Branch Admin detail while keeping the registry marker', async () => {
    await repository.findManagedUserInScope('branch-admin-id', 'BRANCH_ADMIN', {
      scope: 'UNRESTRICTED',
    });

    const query = prisma.user.findFirst.mock.calls[0][0];
    expect(query.where).toEqual(
      expect.objectContaining({
        id: 'branch-admin-id',
        userRoles: expect.any(Object),
      }),
    );
    expect(query.select.userBranches.where).toEqual({});
  });

  it('filters current Branch Admin assignments and their status server-side', async () => {
    await repository.listManagedUsers(
      'BRANCH_ADMIN',
      { scope: 'UNRESTRICTED' },
      0,
      10,
      undefined,
      { assignedBranchId: 'branch-id', assignmentIsActive: false },
    );

    expect(prisma.user.findMany.mock.calls[0][0].where.userBranches).toEqual({
      some: expect.objectContaining({
        branchId: 'branch-id',
        isActive: false,
        roles: expect.any(Object),
      }),
    });
    expect(
      prisma.user.findMany.mock.calls[0][0].select.userBranches.where,
    ).toEqual(expect.objectContaining({ roles: expect.any(Object) }));
  });

  it('sorts authoritative Branch Admin fields in Prisma with a stable id tie-break', async () => {
    await repository.listManagedUsers(
      'BRANCH_ADMIN',
      { scope: 'UNRESTRICTED' },
      0,
      10,
      undefined,
      undefined,
      BranchAdminSortField.FULL_NAME,
      'asc',
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('sorts computed primary branch over the full filtered set before pagination', async () => {
    prisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'admin-b',
        userBranches: [
          { isPrimary: true, isActive: true, branch: { name: 'Beta' } },
        ],
      },
      {
        id: 'admin-a',
        userBranches: [
          { isPrimary: true, isActive: true, branch: { name: 'Alpha' } },
        ],
      },
    ]);
    prisma.user.count.mockResolvedValueOnce(2);

    const [items, total] = await repository.listManagedUsers(
      'BRANCH_ADMIN',
      { scope: 'UNRESTRICTED' },
      0,
      1,
      undefined,
      undefined,
      BranchAdminSortField.PRIMARY_BRANCH,
      'asc',
    );

    expect(prisma.user.findMany.mock.calls[0][0]).not.toHaveProperty('take');
    expect(items.map(({ id }) => id)).toEqual(['admin-a']);
    expect(total).toBe(2);
  });

  it.each([
    [BranchAdminAssignmentState.UNASSIGNED, 'none', undefined],
    [BranchAdminAssignmentState.ACTIVE, 'some', true],
    [BranchAdminAssignmentState.INACTIVE_ONLY, 'none', true],
  ])(
    'filters Branch Admin aggregate assignment state %s',
    async (state, relation, isActive) => {
      await repository.listManagedUsers(
        'BRANCH_ADMIN',
        { scope: 'UNRESTRICTED' },
        0,
        10,
        undefined,
        { assignmentState: state },
      );

      const assignmentWhere =
        prisma.user.findMany.mock.calls[0][0].where.userBranches;
      expect(assignmentWhere[relation]).toEqual(
        expect.objectContaining({
          roles: expect.any(Object),
          ...(isActive === undefined ? {} : { isActive }),
        }),
      );
    },
  );

  it('applies assignment state to the selected branch mapping', async () => {
    await repository.listManagedUsers(
      'BRANCH_ADMIN',
      { scope: 'UNRESTRICTED' },
      0,
      10,
      undefined,
      {
        assignedBranchId: 'branch-id',
        assignmentState: BranchAdminAssignmentState.ACTIVE,
      },
    );

    expect(prisma.user.findMany.mock.calls[0][0].where.userBranches).toEqual({
      some: expect.objectContaining({
        branchId: 'branch-id',
        isActive: true,
        roles: expect.any(Object),
      }),
    });
  });

  it('interprets unassigned with a branch as no mapping at that branch', async () => {
    await repository.listManagedUsers(
      'BRANCH_ADMIN',
      { scope: 'UNRESTRICTED' },
      0,
      10,
      undefined,
      {
        assignedBranchId: 'branch-id',
        assignmentState: BranchAdminAssignmentState.UNASSIGNED,
      },
    );

    expect(prisma.user.findMany.mock.calls[0][0].where.userBranches).toEqual({
      none: expect.objectContaining({
        branchId: 'branch-id',
        roles: expect.any(Object),
      }),
    });
  });
});

describe('AuthorizationRepository Staff list and candidates', () => {
  const prisma = {
    userBranch: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    user: { findMany: jest.fn(), count: jest.fn() },
  };
  const repository = new AuthorizationRepository(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.userBranch.findMany.mockResolvedValue([]);
    prisma.userBranch.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
  });

  it('composes selected-branch Staff filters for data and count', async () => {
    await repository.listStaff({
      branchId: 'branch-id',
      skip: 10,
      take: 10,
      search: 'cashier',
      sortBy: StaffSortField.ASSIGNMENT_IS_ACTIVE,
      sortOrder: 'asc',
      userIsActive: true,
      assignmentIsActive: false,
      isPrimary: false,
      roleId: 'role-id',
    });

    const dataQuery = prisma.userBranch.findMany.mock.calls[0][0];
    expect(dataQuery.where).toEqual(
      expect.objectContaining({
        branchId: 'branch-id',
        isActive: false,
        isPrimary: false,
        user: expect.objectContaining({
          type: UserType.BRANCH,
          isActive: true,
          OR: expect.arrayContaining([
            { phone: { contains: 'cashier', mode: 'insensitive' } },
          ]),
        }),
        roles: {
          some: expect.objectContaining({ roleId: 'role-id' }),
        },
      }),
    );
    expect(prisma.userBranch.count).toHaveBeenCalledWith({
      where: dataQuery.where,
    });
    expect(dataQuery.orderBy).toEqual([{ isActive: 'asc' }, { id: 'asc' }]);
  });

  it('excludes every existing selected-branch assignment from candidates', async () => {
    await repository.listStaffCandidates({
      branchId: 'branch-id',
      skip: 0,
      take: 20,
      search: 'admin',
    });

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        type: UserType.BRANCH,
        userBranches: { none: { branchId: 'branch-id' } },
      }),
    );
    expect(prisma.user.count).toHaveBeenCalledWith({ where });
  });
});

describe('AuthorizationRepository management transactions', () => {
  const tx = {
    role: { count: jest.fn(), findFirst: jest.fn() },
    permission: { count: jest.fn() },
    branch: { count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    user: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    userRole: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    userPermission: { createMany: jest.fn(), deleteMany: jest.fn() },
    userBranch: {
      create: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    userBranchRole: {
      create: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
    userBranchPermission: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    authSession: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const repository = new AuthorizationRepository(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    tx.role.count.mockResolvedValue(1);
    tx.role.findFirst.mockResolvedValue({ id: 'branch-admin-role' });
    tx.permission.count.mockResolvedValue(1);
    tx.branch.count.mockResolvedValue(1);
    tx.branch.findFirst.mockResolvedValue({ id: 'branch-id', isActive: true });
    tx.branch.update.mockResolvedValue({ id: 'branch-id', isActive: false });
    tx.user.create.mockResolvedValue({ id: 'staff-id' });
    tx.userBranch.create.mockResolvedValue({ id: 'user-branch-id' });
    tx.userBranch.upsert.mockResolvedValue({
      id: 'user-branch-id',
      userId: 'branch-admin-id',
      branchId: 'branch-id',
      isPrimary: false,
      isActive: true,
    });
    tx.userBranch.count.mockResolvedValue(1);
    tx.userBranch.findUnique.mockResolvedValue(null);
    tx.user.findFirst.mockResolvedValue({ id: 'customer-id' });
    tx.user.findUniqueOrThrow.mockResolvedValue({ id: 'staff-id' });
  });

  it('runs management writes in Serializable transactions', async () => {
    await repository.transaction(() => Promise.resolve('ok'));

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('retries transaction conflicts and normalizes exhausted conflicts', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: 'test',
    });
    prisma.$transaction.mockRejectedValue(conflict);

    await expect(
      repository.transaction(() => Promise.resolve('ok')),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('creates staff, roles, permissions and primary branch in one transaction', async () => {
    await repository.createInternalUser({
      email: 'staff@example.com',
      fullName: 'Staff',
      passwordHash: 'hash',
      type: 'BRANCH',
      roleIds: ['role-id'],
      permissionIds: ['permission-id'],
      branchIds: ['branch-id'],
      assignedBy: 'actor-id',
      actorMaxRoleLevel: 70,
      allowedPermissionCodes: ['orders.read'],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.userRole.createMany).not.toHaveBeenCalled();
    expect(tx.userPermission.createMany).not.toHaveBeenCalled();
    expect(tx.userBranch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchId: 'branch-id',
        isPrimary: true,
        isActive: true,
      }),
      select: { id: true },
    });
    expect(tx.userBranchRole.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userBranchId: 'user-branch-id',
          roleId: 'role-id',
        }),
      ],
    });
    expect(tx.userBranchPermission.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userBranchId: 'user-branch-id',
          permissionId: 'permission-id',
        }),
      ],
    });
  });

  it('assigns an existing BRANCH user with roles and permissions atomically', async () => {
    tx.user.findFirst.mockResolvedValue({
      id: 'branch-user',
      userBranches: [],
    });
    tx.userBranch.findUnique.mockResolvedValue(null);
    tx.userBranch.findUniqueOrThrow.mockResolvedValue({
      id: 'user-branch-id',
      user: { id: 'branch-user' },
      roles: [],
      permissions: [],
    });

    await repository.assignExistingStaff({
      userId: 'branch-user',
      branchId: 'branch-id',
      roleIds: ['role-id'],
      permissionIds: ['permission-id'],
      assignedBy: 'actor-id',
      actorMaxRoleLevel: 70,
      allowedPermissionCodes: ['orders.read'],
    });

    expect(tx.userBranch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'branch-user',
        branchId: 'branch-id',
        isPrimary: true,
        isActive: true,
      }),
      select: { id: true },
    });
    expect(tx.userBranchRole.createMany).toHaveBeenCalledTimes(1);
    expect(tx.userBranchPermission.createMany).toHaveBeenCalledTimes(1);
  });

  it('creates a global Branch Admin identity marker atomically', async () => {
    tx.permission.count.mockResolvedValue(0);
    await repository.createInternalUser({
      email: 'branch-admin@example.com',
      fullName: 'Branch Admin',
      passwordHash: 'hash',
      type: 'BRANCH',
      roleIds: ['branch-admin-role'],
      branchIds: ['branch-id'],
      assignedBy: 'actor-id',
      actorMaxRoleLevel: 99,
      allowedPermissionCodes: [],
      requiredRoleCode: 'BRANCH_ADMIN',
    });

    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'staff-id',
          roleId: 'branch-admin-role',
          assignedBy: 'actor-id',
        },
      ],
    });
  });

  it('adds Branch Admin to an existing UserBranch without replacing Staff roles', async () => {
    await repository.assignUserBranch(
      'branch-admin-id',
      'branch-id',
      'actor-id',
      'BRANCH_ADMIN',
    );

    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'branch-admin-id',
          type: UserType.BRANCH,
          userRoles: expect.any(Object),
        }),
      }),
    );
    expect(tx.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_roleId: {
            userId: 'branch-admin-id',
            roleId: 'branch-admin-role',
          },
        },
      }),
    );

    expect(tx.userBranch.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_branchId: {
            userId: 'branch-admin-id',
            branchId: 'branch-id',
          },
        },
      }),
    );
    expect(tx.userBranchRole.deleteMany).not.toHaveBeenCalled();
  });

  it('does not create a user when transaction revalidation fails', async () => {
    tx.role.count.mockResolvedValue(0);

    await expect(
      repository.createInternalUser({
        email: 'staff@example.com',
        fullName: 'Staff',
        passwordHash: 'hash',
        type: 'BRANCH',
        roleIds: ['role-id'],
        branchIds: ['branch-id'],
        assignedBy: 'actor-id',
        actorMaxRoleLevel: 70,
        allowedPermissionCodes: [],
      }),
    ).rejects.toThrow('Role, permission hoặc branch');
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('converts a Customer without deleting business data and creates one primary branch', async () => {
    tx.branch.count.mockResolvedValue(2);

    await repository.convertToBranchAdmin(
      'customer-id',
      'branch-admin-role',
      ['branch-a', 'branch-b'],
      'actor-id',
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'customer-id' },
      data: { type: 'BRANCH' },
    });
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: 'customer-id',
        roleId: 'branch-admin-role',
        assignedBy: 'actor-id',
      },
    });
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'customer-id' },
    });
    expect(tx.userPermission.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'customer-id' },
    });
    expect(tx.userBranch.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ branchId: 'branch-a', isPrimary: true }),
      select: { id: true },
    });
    expect(tx.userBranch.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ branchId: 'branch-b', isPrimary: false }),
      select: { id: true },
    });
    expect(tx.userBranchRole.create).toHaveBeenCalledTimes(2);
    expect('delete' in tx.user).toBe(false);
  });

  it('converts Customer to multi-branch Staff with branch-local roles and permissions', async () => {
    tx.branch.count.mockResolvedValue(2);
    tx.role.count.mockResolvedValue(2);
    tx.permission.count.mockResolvedValue(2);
    tx.user.findFirst.mockResolvedValue({ id: 'customer-id' });

    await repository.convertCustomerToStaff({
      userId: 'customer-id',
      assignedBy: 'actor-id',
      branchAssignments: [
        {
          branchId: 'hau-giang',
          isPrimary: true,
          roleIds: ['staff-role'],
          permissions: [{ permissionId: 'inventory-update', effect: 'ALLOW' }],
        },
        {
          branchId: 'can-tho',
          isPrimary: false,
          roleIds: ['cashier-role'],
          permissions: [{ permissionId: 'payments-create', effect: 'ALLOW' }],
        },
      ],
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'customer-id' },
      data: { type: 'BRANCH' },
    });
    expect(tx.userBranch.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        branchId: 'hau-giang',
        isPrimary: true,
      }),
      select: { id: true },
    });
    expect(tx.userBranch.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        branchId: 'can-tho',
        isPrimary: false,
      }),
      select: { id: true },
    });
    expect(tx.userBranchRole.createMany).toHaveBeenCalledTimes(2);
    expect(tx.userBranchPermission.createMany).toHaveBeenCalledTimes(2);
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'customer-id' },
    });
    expect(tx.userPermission.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'customer-id' },
    });
    expect(tx.permission.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: ['inventory-update', 'payments-create'] },
        guardName: 'web',
        code: expect.objectContaining({ notIn: expect.any(Array) }),
      }),
    });
  });

  it('rolls back the full conversion when permission revalidation rejects an override', async () => {
    tx.permission.count.mockResolvedValue(0);

    await expect(
      repository.convertCustomerToStaff({
        userId: 'customer-id',
        assignedBy: 'actor-id',
        branchAssignments: [
          {
            branchId: 'branch-id',
            isPrimary: true,
            roleIds: ['staff-role'],
            permissions: [
              { permissionId: 'dangerous-id', effect: PermissionEffect.DENY },
            ],
          },
        ],
      }),
    ).rejects.toThrow('permission');

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.userBranch.create).not.toHaveBeenCalled();
    expect(tx.userBranchRole.createMany).not.toHaveBeenCalled();
    expect(tx.userBranchPermission.createMany).not.toHaveBeenCalled();
  });

  it('revokes sessions and disables the user in the same transaction', async () => {
    const assertAllowed = jest.fn();
    await repository.disableUser(
      'staff-id',
      { scope: 'UNRESTRICTED' },
      assertAllowed,
    );

    expect(assertAllowed).toHaveBeenCalledWith(tx);
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'staff-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'staff-id' },
        data: { isActive: false },
      }),
    );
  });

  it('rechecks staff scope and policy inside the update transaction', async () => {
    const assertAllowed = jest.fn();
    await repository.updateManagedUserInScope(
      'staff-id',
      { scope: 'FILTERED', where: { branchId: 'branch-id' } },
      { fullName: 'Updated' },
      assertAllowed,
    );

    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'staff-id',
          userBranches: {
            some: expect.objectContaining({ branchId: 'branch-id' }),
          },
        }),
      }),
    );
    expect(assertAllowed).toHaveBeenCalledWith(tx);
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'staff-id' } }),
    );
  });

  it('sets only one primary branch and does not create an unassigned branch', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      branchId: 'branch-id',
    });

    await repository.setPrimaryUserBranch(
      'staff-id',
      'branch-id',
      'actor-id',
      'STAFF',
    );

    expect(tx.userBranch.updateMany).toHaveBeenCalledWith({
      where: { userId: 'staff-id' },
      data: { isPrimary: false },
    });
    expect(tx.userBranch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_branchId: { userId: 'staff-id', branchId: 'branch-id' },
        },
        data: expect.objectContaining({ isPrimary: true }),
      }),
    );
    expect(tx.userBranch.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: true }),
      }),
    );
  });

  it('does not set an inactive assignment as primary', async () => {
    tx.userBranch.findFirst.mockResolvedValue(null);

    await expect(
      repository.setPrimaryUserBranch(
        'staff-id',
        'branch-id',
        'actor-id',
        'STAFF',
      ),
    ).rejects.toThrow('assignment đang hoạt động');

    expect(tx.userBranch.updateMany).not.toHaveBeenCalled();
    expect(tx.userBranch.update).not.toHaveBeenCalled();
  });

  it('blocks branch deactivation while active user assignments remain', async () => {
    tx.userBranch.count.mockResolvedValue(1);

    await expect(
      repository.deactivateBranchInScope('branch-id', {
        scope: 'UNRESTRICTED',
      }),
    ).rejects.toThrow('assignment active');

    expect(tx.branch.update).not.toHaveBeenCalled();
  });

  it('deactivates a branch when no active user assignments remain', async () => {
    tx.userBranch.count.mockResolvedValue(0);

    await repository.deactivateBranchInScope('branch-id', {
      scope: 'UNRESTRICTED',
    });

    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: 'branch-id' },
      data: { isActive: false },
      select: expect.any(Object),
    });
  });

  it('uses the same lifecycle invariant for update active to inactive', async () => {
    tx.userBranch.count.mockResolvedValue(1);

    await expect(
      repository.updateBranchInScope(
        'branch-id',
        { scope: 'UNRESTRICTED' },
        { name: 'Updated', isActive: false },
      ),
    ).rejects.toThrow('assignment active');

    expect(tx.branch.update).not.toHaveBeenCalled();
  });

  it('reactivates an inactive branch without changing assignments', async () => {
    tx.branch.findFirst.mockResolvedValue({ id: 'branch-id', isActive: false });

    await repository.updateBranchInScope(
      'branch-id',
      { scope: 'UNRESTRICTED' },
      { name: 'Reactivated', isActive: true },
    );

    expect(tx.userBranch.count).not.toHaveBeenCalled();
    expect(tx.branch.update).toHaveBeenCalledWith({
      where: { id: 'branch-id' },
      data: { name: 'Reactivated', isActive: true },
      select: expect.any(Object),
    });
  });

  it.each([
    { current: true, requested: true },
    { current: false, requested: false },
  ])(
    'keeps lifecycle writes idempotent for $current → $requested',
    async ({ current, requested }) => {
      tx.branch.findFirst.mockResolvedValue({
        id: 'branch-id',
        isActive: current,
      });

      await repository.updateBranchInScope(
        'branch-id',
        { scope: 'UNRESTRICTED' },
        { isActive: requested },
      );

      expect(tx.userBranch.count).not.toHaveBeenCalled();
      expect(tx.branch.update).toHaveBeenCalled();
    },
  );

  it('transfers primary staff branch to a new destination without revoking sessions', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'source-assignment',
      isPrimary: true,
    });
    tx.userBranch.create.mockResolvedValue({ id: 'destination-assignment' });
    tx.userBranch.count.mockResolvedValue(1);

    await repository.transferStaffBranch({
      userId: 'staff-id',
      fromBranchId: 'branch-a',
      toBranchId: 'branch-b',
      destinationRoleIds: ['staff-role'],
      assignedBy: 'actor-id',
    });

    expect(tx.userBranch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'staff-id',
        branchId: 'branch-b',
        isActive: true,
        isPrimary: false,
      }),
      select: { id: true },
    });
    expect(tx.userBranchRole.deleteMany).toHaveBeenCalledWith({
      where: { userBranchId: 'destination-assignment' },
    });
    expect(tx.userBranchRole.createMany).toHaveBeenCalledWith({
      data: [
        {
          userBranchId: 'destination-assignment',
          roleId: 'staff-role',
          assignedBy: 'actor-id',
        },
      ],
    });
    expect(tx.userBranchPermission.deleteMany).toHaveBeenCalledWith({
      where: { userBranchId: 'destination-assignment' },
    });
    expect(tx.userBranch.updateMany).toHaveBeenCalledWith({
      where: { userId: 'staff-id' },
      data: { isPrimary: false },
    });
    expect(tx.userBranch.update).toHaveBeenCalledWith({
      where: { id: 'destination-assignment' },
      data: { isPrimary: true },
    });
    expect(tx.userBranch.update).toHaveBeenCalledWith({
      where: { id: 'source-assignment' },
      data: { isActive: false, isPrimary: false },
    });
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it('reactivates an inactive destination assignment and reconciles roles', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'source-assignment',
      isPrimary: false,
    });
    tx.userBranch.findUnique.mockResolvedValue({
      id: 'destination-assignment',
      isActive: false,
    });
    tx.userBranch.update.mockResolvedValueOnce({
      id: 'destination-assignment',
    });

    await repository.transferStaffBranch({
      userId: 'staff-id',
      fromBranchId: 'branch-a',
      toBranchId: 'branch-b',
      destinationRoleIds: ['cashier-role'],
      assignedBy: 'actor-id',
    });

    expect(tx.userBranch.create).not.toHaveBeenCalled();
    expect(tx.userBranch.update).toHaveBeenCalledWith({
      where: { id: 'destination-assignment' },
      data: expect.objectContaining({
        isActive: true,
        isPrimary: false,
        assignedBy: 'actor-id',
      }),
      select: { id: true },
    });
    expect(tx.userBranchRole.deleteMany).toHaveBeenCalledWith({
      where: { userBranchId: 'destination-assignment' },
    });
    expect(tx.userBranchRole.createMany).toHaveBeenCalledWith({
      data: [
        {
          userBranchId: 'destination-assignment',
          roleId: 'cashier-role',
          assignedBy: 'actor-id',
        },
      ],
    });
    expect(tx.userBranch.updateMany).not.toHaveBeenCalledWith({
      where: { userId: 'staff-id' },
      data: { isPrimary: false },
    });
  });

  it('returns conflict when the destination assignment is already active', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'source-assignment',
      isPrimary: false,
    });
    tx.userBranch.findUnique.mockResolvedValue({
      id: 'destination-assignment',
      isActive: true,
    });

    await expect(
      repository.transferStaffBranch({
        userId: 'staff-id',
        fromBranchId: 'branch-a',
        toBranchId: 'branch-b',
        destinationRoleIds: ['staff-role'],
        assignedBy: 'actor-id',
      }),
    ).rejects.toThrow('assignment active');

    expect(tx.userBranchRole.deleteMany).not.toHaveBeenCalled();
    expect(tx.userBranch.update).not.toHaveBeenCalledWith({
      where: { id: 'source-assignment' },
      data: { isActive: false, isPrimary: false },
    });
  });

  it('requires a valid replacement inside the transaction before deactivating a primary branch', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'assignment',
      isPrimary: true,
    });
    tx.userBranch.findMany.mockResolvedValue([{ branchId: 'branch-b' }]);

    await expect(
      repository.setUserBranchActive('staff-id', 'branch-a', false, 'STAFF'),
    ).rejects.toThrow('primary branch');
    expect(tx.userBranch.update).not.toHaveBeenCalled();
  });

  it('reactivates an assignment without reactivating the user account', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'assignment',
      isPrimary: false,
    });
    tx.userBranch.update.mockResolvedValue({
      userId: 'staff-id',
      branchId: 'branch-a',
      isActive: true,
    });

    await repository.setUserBranchActive('staff-id', 'branch-a', true, 'STAFF');

    expect(tx.userBranch.update).toHaveBeenCalledWith({
      where: {
        userId_branchId: { userId: 'staff-id', branchId: 'branch-a' },
      },
      data: { isActive: true },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(tx.userBranch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ roles: expect.any(Object) }),
      }),
    );
  });

  it('moves primary before deactivating the current primary assignment', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'assignment',
      isPrimary: true,
    });
    tx.userBranch.findMany.mockResolvedValue([{ branchId: 'branch-b' }]);
    tx.userBranch.update.mockResolvedValue({ isActive: false });
    tx.userBranch.count.mockResolvedValue(1);

    await repository.setUserBranchActive(
      'staff-id',
      'branch-a',
      false,
      'STAFF',
      'branch-b',
    );

    expect(tx.userBranch.update).toHaveBeenNthCalledWith(1, {
      where: {
        userId_branchId: { userId: 'staff-id', branchId: 'branch-a' },
      },
      data: { isPrimary: false },
    });
    expect(tx.userBranch.update).toHaveBeenNthCalledWith(2, {
      where: {
        userId_branchId: { userId: 'staff-id', branchId: 'branch-b' },
      },
      data: { isPrimary: true, isActive: true },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('requires a valid replacement inside the transaction before removing a primary branch', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'assignment',
      isPrimary: true,
    });
    tx.userBranch.findMany.mockResolvedValue([{ branchId: 'branch-b' }]);

    await expect(
      repository.removeUserBranch('staff-id', 'branch-a', 'STAFF', 'branch-c'),
    ).rejects.toThrow('primary branch');
    expect(tx.userBranch.deleteMany).not.toHaveBeenCalled();
  });

  it('treats removal of a missing branch assignment as idempotent', async () => {
    tx.userBranch.findFirst.mockResolvedValue(null);

    await expect(
      repository.removeUserBranch('staff-id', 'branch-a', 'STAFF'),
    ).resolves.toEqual({ count: 0 });
    expect(tx.userBranch.deleteMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('removes a primary mapping after promoting a valid replacement', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'assignment',
      isPrimary: true,
    });
    tx.userBranch.findMany.mockResolvedValue([{ branchId: 'branch-b' }]);
    tx.userBranch.deleteMany.mockResolvedValue({ count: 1 });
    tx.userBranch.count.mockResolvedValue(1);

    await expect(
      repository.removeUserBranch('staff-id', 'branch-a', 'STAFF', 'branch-b'),
    ).resolves.toEqual({ count: 1 });
    expect(tx.userBranch.updateMany).toHaveBeenCalledWith({
      where: { userId: 'staff-id' },
      data: { isPrimary: false },
    });
    expect(tx.userBranch.update).toHaveBeenCalledWith({
      where: {
        userId_branchId: { userId: 'staff-id', branchId: 'branch-b' },
      },
      data: { isPrimary: true, isActive: true },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects Branch Admin removal for a Staff-only assignment', async () => {
    tx.userBranch.findFirst.mockResolvedValue(null);

    await expect(
      repository.removeUserBranch('candidate-id', 'branch-id', 'BRANCH_ADMIN'),
    ).rejects.toBeInstanceOf(AuthorizationWriteScopeError);
    expect(tx.userBranchRole.deleteMany).not.toHaveBeenCalled();
    expect(tx.userBranch.deleteMany).not.toHaveBeenCalled();
  });

  it('removes only BRANCH_ADMIN role when the UserBranch also has Staff roles', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'mixed-assignment',
      isPrimary: true,
    });
    tx.userBranchRole.count.mockResolvedValue(1);

    await expect(
      repository.removeUserBranch('candidate-id', 'branch-id', 'BRANCH_ADMIN'),
    ).resolves.toEqual({ count: 1 });

    expect(tx.userBranchRole.deleteMany).toHaveBeenCalledWith({
      where: {
        userBranchId: 'mixed-assignment',
        role: expect.objectContaining({ code: 'BRANCH_ADMIN' }),
      },
    });
    expect(tx.userBranch.deleteMany).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('offboards only the selected branch and deterministically promotes the oldest remaining assignment', async () => {
    const assertAllowed = jest.fn();
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'hau-giang-assignment',
      isPrimary: true,
    });
    tx.userBranch.findMany.mockResolvedValue([
      { id: 'can-tho-assignment', isPrimary: false },
    ]);

    await repository.offboardUserFromBranch(
      'staff-id',
      'hau-giang',
      assertAllowed,
    );

    expect(tx.userBranch.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'hau-giang-assignment' },
      data: { isActive: false, isPrimary: false },
    });
    expect(tx.userBranch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'staff-id',
          isActive: true,
        }),
        orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(tx.userBranch.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'can-tho-assignment' },
      data: { isPrimary: true },
    });
    expect(tx.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it('disables the account and revokes sessions when offboarding the last active branch', async () => {
    tx.userBranch.findFirst.mockResolvedValue({
      id: 'only-assignment',
      isPrimary: true,
    });
    tx.userBranch.findMany.mockResolvedValue([]);

    await repository.offboardUserFromBranch('staff-id', 'hau-giang', jest.fn());

    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'staff-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'staff-id' },
      data: { isActive: false },
    });
  });

  it('keeps Customer type unchanged when conversion revalidation fails', async () => {
    tx.user.findFirst.mockResolvedValue(null);

    await expect(
      repository.convertCustomerToStaff({
        userId: 'not-customer',
        assignedBy: 'actor-id',
        branchAssignments: [
          {
            branchId: 'hau-giang',
            isPrimary: true,
            roleIds: ['staff-role'],
            permissions: [],
          },
        ],
      }),
    ).rejects.toThrow('CUSTOMER');

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.userBranch.create).not.toHaveBeenCalled();
    expect(tx.userBranchRole.createMany).not.toHaveBeenCalled();
    expect(tx.userBranchPermission.createMany).not.toHaveBeenCalled();
  });

  it('blocks removing the last qualifying role and preserves the mapping', async () => {
    tx.userBranchRole.findUnique.mockResolvedValue({
      id: 'mapping-id',
      role: {
        code: 'STAFF',
        type: UserType.BRANCH,
        guardName: 'web',
        isActive: true,
      },
    });
    tx.userBranchRole.count.mockResolvedValue(1);

    await expect(
      repository.removeUserRole('user-branch-id', 'role-id', tx as never),
    ).rejects.toThrow('Staff cuối cùng');
    expect(tx.userBranchRole.deleteMany).not.toHaveBeenCalled();
  });

  it('removes one qualifying role when another remains', async () => {
    tx.userBranchRole.findUnique.mockResolvedValue({
      id: 'mapping-id',
      role: {
        code: 'STAFF',
        type: UserType.BRANCH,
        guardName: 'web',
        isActive: true,
      },
    });
    tx.userBranchRole.count.mockResolvedValue(2);
    tx.userBranchRole.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.removeUserRole('user-branch-id', 'role-id', tx as never),
    ).resolves.toEqual({ count: 1 });
  });

  it('keeps missing role removal idempotent', async () => {
    tx.userBranchRole.findUnique.mockResolvedValue(null);

    await expect(
      repository.removeUserRole('user-branch-id', 'role-id', tx as never),
    ).resolves.toEqual({ count: 0 });
    expect(tx.userBranchRole.deleteMany).not.toHaveBeenCalled();
  });
});
