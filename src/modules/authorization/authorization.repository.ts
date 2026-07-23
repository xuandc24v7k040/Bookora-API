import { Injectable } from '@nestjs/common';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { PrismaService } from '@/database/prisma.service';
import {
  AuthProvider,
  PermissionEffect,
  Prisma,
  UserType,
} from '@/generated/prisma/client';
import {
  BranchAdminAssignmentState,
  BranchAdminSortField,
  StaffSortField,
} from './dto';
import type { AuthorizationTransactionClient } from './types/authorization-transaction.type';
import type { BranchWhere } from './types/branch-context.type';
import { DANGEROUS_PERMISSION_CODES } from './authorization.constants';
import type {
  BranchSortField,
  PermissionSortField,
  RoleSortField,
} from './dto';

type RoleListQuery = {
  skip: number;
  take: number;
  search?: string;
  type?: UserType;
  isActive?: boolean;
  isSystem?: boolean;
  guardName?: string;
  levelFrom?: number;
  levelTo?: number;
  createdFrom?: Date;
  createdTo?: Date;
  sortBy: RoleSortField;
  sortOrder: Prisma.SortOrder;
};

type PermissionListQuery = {
  skip: number;
  take: number;
  search?: string;
  resource?: string;
  action?: string;
  guardName?: string;
  createdFrom?: Date;
  createdTo?: Date;
  sortBy: PermissionSortField;
  sortOrder: Prisma.SortOrder;
};

const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  guardName: true,
  type: true,
  level: true,
  isSystem: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RoleSelect;

const permissionSelect = {
  id: true,
  code: true,
  name: true,
  resource: true,
  action: true,
  guardName: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PermissionSelect;

const branchSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  phone: true,
  province: true,
  ward: true,
  latitude: true,
  longitude: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BranchSelect;

type BranchLifecycleUpdate = Omit<Prisma.BranchUpdateInput, 'isActive'> & {
  isActive?: boolean;
};

const managedUserBranchSelect = {
  id: true,
  code: true,
  name: true,
  address: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BranchSelect;

function managedUserSelect(
  branchWhere: BranchWhere = { scope: 'UNRESTRICTED' },
  assignmentKind: 'ALL' | 'BRANCH_ADMIN' = 'ALL',
) {
  const userBranchWhere: Prisma.UserBranchWhereInput =
    branchWhere.scope === 'UNRESTRICTED'
      ? {}
      : { branchId: branchWhere.where.branchId };
  if (assignmentKind === 'BRANCH_ADMIN') {
    userBranchWhere.roles = {
      some: {
        role: {
          code: 'BRANCH_ADMIN',
          type: UserType.BRANCH,
          guardName: 'web',
          isActive: true,
        },
      },
    };
  }
  return {
    id: true,
    email: true,
    fullName: true,
    phone: true,
    type: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    userRoles: {
      where: { role: { isActive: true } },
      select: { role: { select: roleSelect } },
    },
    userPermissions: {
      select: {
        effect: true,
        permission: { select: permissionSelect },
      },
    },
    userBranches: {
      where: userBranchWhere,
      select: {
        id: true,
        branchId: true,
        isPrimary: true,
        isActive: true,
        branch: { select: managedUserBranchSelect },
        roles: {
          where: { role: { isActive: true } },
          select: { role: { select: roleSelect } },
        },
        permissions: {
          select: {
            effect: true,
            permission: { select: permissionSelect },
          },
        },
      },
    },
  } satisfies Prisma.UserSelect;
}

export class AuthorizationWriteValidationError extends Error {}
export class AuthorizationWriteScopeError extends Error {}
export class AuthorizationWriteConflictError extends Error {}
export class StaffLastRoleRequiredError extends AuthorizationWriteConflictError {}

type ManagedUserListFilters = {
  assignedBranchId?: string;
  excludeAssignedBranchId?: string;
  isActive?: boolean;
  assignmentIsActive?: boolean;
  assignmentState?: BranchAdminAssignmentState;
};

type StaffListQuery = {
  branchId: string;
  skip: number;
  take: number;
  search?: string;
  sortBy: StaffSortField;
  sortOrder: Prisma.SortOrder;
  userIsActive?: boolean;
  assignmentIsActive?: boolean;
  isPrimary?: boolean;
  roleId?: string;
};

const qualifyingStaffRoleWhere = {
  type: UserType.BRANCH,
  guardName: 'web',
  isActive: true,
  code: { notIn: ['BRANCH_ADMIN', 'SUPER_ADMIN', 'CUSTOMER'] },
} satisfies Prisma.RoleWhereInput;

type ManagedAssignmentKind = 'STAFF' | 'BRANCH_ADMIN';

function managedAssignmentRoleWhere(
  kind: ManagedAssignmentKind,
): Prisma.RoleWhereInput {
  return kind === 'BRANCH_ADMIN'
    ? {
        code: 'BRANCH_ADMIN',
        type: UserType.BRANCH,
        guardName: 'web',
        isActive: true,
      }
    : qualifyingStaffRoleWhere;
}

const staffAssignmentSelect = {
  id: true,
  branchId: true,
  isPrimary: true,
  isActive: true,
  assignedBy: true,
  assignedAt: true,
  branch: {
    select: { id: true, code: true, name: true, isActive: true },
  },
  roles: {
    where: { role: qualifyingStaffRoleWhere },
    orderBy: { role: { code: 'asc' as const } },
    select: {
      role: {
        select: {
          id: true,
          code: true,
          name: true,
          level: true,
          isActive: true,
          isSystem: true,
          type: true,
          guardName: true,
          rolePermissions: {
            orderBy: { permission: { code: 'asc' as const } },
            select: {
              permission: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  resource: true,
                  action: true,
                  guardName: true,
                },
              },
            },
          },
        },
      },
    },
  },
  permissions: {
    orderBy: { permission: { code: 'asc' as const } },
    select: {
      id: true,
      effect: true,
      permission: {
        select: {
          id: true,
          code: true,
          name: true,
          resource: true,
          action: true,
          guardName: true,
        },
      },
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      isActive: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UserBranchSelect;

function staffOrderBy(
  sortBy: StaffSortField,
  sortOrder: Prisma.SortOrder,
): Prisma.UserBranchOrderByWithRelationInput[] {
  const tieBreak = { id: 'asc' as const };
  switch (sortBy) {
    case StaffSortField.FULL_NAME:
      return [{ user: { fullName: sortOrder } }, tieBreak];
    case StaffSortField.EMAIL:
      return [{ user: { email: sortOrder } }, tieBreak];
    case StaffSortField.PHONE:
      return [{ user: { phone: sortOrder } }, tieBreak];
    case StaffSortField.USER_IS_ACTIVE:
      return [{ user: { isActive: sortOrder } }, tieBreak];
    case StaffSortField.ASSIGNMENT_IS_ACTIVE:
      return [{ isActive: sortOrder }, tieBreak];
    case StaffSortField.IS_PRIMARY:
      return [{ isPrimary: sortOrder }, tieBreak];
    case StaffSortField.CREATED_AT:
      return [{ user: { createdAt: sortOrder } }, tieBreak];
    case StaffSortField.ASSIGNED_AT:
    default:
      return [{ assignedAt: sortOrder }, tieBreak];
  }
}

function compareNullableText(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: Prisma.SortOrder,
): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return (
    left.localeCompare(right, 'vi', { sensitivity: 'base' }) *
    (direction === 'asc' ? 1 : -1)
  );
}

function branchAdminOrderBy(
  sortBy: BranchAdminSortField,
  sortOrder: Prisma.SortOrder,
): Prisma.UserOrderByWithRelationInput[] | undefined {
  switch (sortBy) {
    case BranchAdminSortField.FULL_NAME:
      return [{ fullName: sortOrder }, { id: 'asc' }];
    case BranchAdminSortField.EMAIL:
      return [{ email: sortOrder }, { id: 'asc' }];
    case BranchAdminSortField.PHONE:
      return [{ phone: sortOrder }, { id: 'asc' }];
    case BranchAdminSortField.IS_ACTIVE:
      return [{ isActive: sortOrder }, { id: 'asc' }];
    case BranchAdminSortField.CREATED_AT:
      return [{ createdAt: sortOrder }, { id: 'asc' }];
    case BranchAdminSortField.PRIMARY_BRANCH:
    case BranchAdminSortField.ASSIGNMENTS:
      return undefined;
  }
}

@Injectable()
export class AuthorizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveSessionPrincipalSource(
    sessionId: string,
    userId: string,
    now = new Date(),
  ) {
    return this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            gender: true,
            birthday: true,
            avatarUrl: true,
            type: true,
            isActive: true,
            userRoles: {
              select: {
                role: {
                  select: {
                    id: true,
                    code: true,
                    level: true,
                    type: true,
                    isSystem: true,
                    isActive: true,
                    rolePermissions: {
                      select: {
                        permission: { select: { code: true } },
                      },
                    },
                  },
                },
              },
            },
            userPermissions: {
              select: {
                effect: true,
                permission: { select: { code: true } },
              },
            },
            userBranches: {
              orderBy: { assignedAt: 'asc' },
              select: {
                id: true,
                branchId: true,
                isPrimary: true,
                isActive: true,
                roles: {
                  select: {
                    role: {
                      select: {
                        id: true,
                        code: true,
                        level: true,
                        type: true,
                        isSystem: true,
                        isActive: true,
                        rolePermissions: {
                          select: {
                            permission: { select: { code: true } },
                          },
                        },
                      },
                    },
                  },
                },
                permissions: {
                  select: {
                    effect: true,
                    permission: { select: { code: true } },
                  },
                },
                branch: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findAllPermissionCodes(): Promise<string[]> {
    const permissions = await this.prisma.permission.findMany({
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    return permissions.map(({ code }) => code);
  }

  findAllActiveBranches() {
    return this.prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
  }

  findActiveBranchById(id: string) {
    return this.prisma.branch.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
  }

  findRolePolicySubject(
    id: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.role.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        type: true,
        level: true,
        guardName: true,
        isSystem: true,
        isActive: true,
      },
    });
  }

  findPermissionPolicySubject(
    id: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.permission.findUnique({
      where: { id },
      select: { id: true, code: true, guardName: true },
    });
  }

  findUserPolicySubject(
    id: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.user.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        isActive: true,
        userRoles: {
          where: { role: { isActive: true } },
          select: {
            role: {
              select: {
                id: true,
                code: true,
                level: true,
                type: true,
                isSystem: true,
                isActive: true,
              },
            },
          },
        },
        userBranches: {
          where: { isActive: true, branch: { isActive: true } },
          select: {
            branchId: true,
            roles: {
              where: { role: { isActive: true } },
              select: {
                role: {
                  select: {
                    id: true,
                    code: true,
                    level: true,
                    type: true,
                    isSystem: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  findActiveUserBranchPolicySubject(
    userId: string,
    branchId: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.userBranch.findFirst({
      where: {
        userId,
        branchId,
        isActive: true,
        branch: { isActive: true },
      },
      select: {
        id: true,
        userId: true,
        branchId: true,
        roles: {
          where: { role: { isActive: true } },
          select: {
            role: {
              select: {
                id: true,
                code: true,
                level: true,
                type: true,
                isSystem: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
  }

  isActiveSuperAdmin(
    userId: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        userRoles: {
          some: {
            role: { code: 'SUPER_ADMIN', isActive: true },
          },
        },
      },
      select: { id: true },
    });
  }

  countActiveSuperAdmins(
    client: AuthorizationTransactionClient = this.prisma,
  ): Promise<number> {
    return client.user.count({
      where: {
        isActive: true,
        userRoles: {
          some: {
            role: { code: 'SUPER_ADMIN', isActive: true },
          },
        },
      },
    });
  }

  transaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
    return runSerializableTransaction(this.prisma, callback);
  }

  listRoles(query: RoleListQuery) {
    const where: Prisma.RoleWhereInput = {
      ...(query.search
        ? {
            OR: [
              {
                code: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.isSystem === undefined ? {} : { isSystem: query.isSystem }),
      ...(query.guardName ? { guardName: query.guardName } : {}),
      ...(query.levelFrom === undefined && query.levelTo === undefined
        ? {}
        : {
            level: {
              ...(query.levelFrom === undefined
                ? {}
                : { gte: query.levelFrom }),
              ...(query.levelTo === undefined ? {} : { lte: query.levelTo }),
            },
          }),
      ...(query.createdFrom === undefined && query.createdTo === undefined
        ? {}
        : {
            createdAt: {
              ...(query.createdFrom ? { gte: query.createdFrom } : {}),
              ...(query.createdTo ? { lt: query.createdTo } : {}),
            },
          }),
    };
    return Promise.all([
      this.prisma.role.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        select: roleSelect,
      }),
      this.prisma.role.count({ where }),
    ]);
  }

  listAssignableStaffRoles(query: {
    skip: number;
    take: number;
    search?: string;
    maxRoleLevel: number;
  }) {
    const where: Prisma.RoleWhereInput = {
      type: UserType.BRANCH,
      guardName: 'web',
      isActive: true,
      level: { lt: query.maxRoleLevel },
      code: { notIn: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'CUSTOMER'] },
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    return Promise.all([
      this.prisma.role.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          ...roleSelect,
          rolePermissions: {
            select: { permission: { select: permissionSelect } },
          },
        },
      }),
      this.prisma.role.count({ where }),
    ]);
  }

  listAssignableStaffPermissions(query: {
    skip: number;
    take: number;
    search?: string;
    actorPermissionCodes?: string[];
    permissionCodes: readonly string[];
    excludedCodes: string[];
  }) {
    const where: Prisma.PermissionWhereInput = {
      guardName: 'web',
      code: {
        notIn: query.excludedCodes,
        in: query.actorPermissionCodes
          ? query.permissionCodes.filter((code) =>
              query.actorPermissionCodes?.includes(code),
            )
          : [...query.permissionCodes],
      },
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { resource: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    return Promise.all([
      this.prisma.permission.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ resource: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: permissionSelect,
      }),
      this.prisma.permission.count({ where }),
    ]);
  }

  findRoleDetail(id: string) {
    return this.prisma.role.findUnique({
      where: { id },
      select: {
        ...roleSelect,
        rolePermissions: {
          select: { permission: { select: permissionSelect } },
        },
      },
    });
  }

  createRole(data: Prisma.RoleUncheckedCreateInput) {
    return this.prisma.role.create({ data, select: roleSelect });
  }

  updateRole(
    id: string,
    data: Prisma.RoleUpdateInput,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.role.update({
      where: { id },
      data,
      select: roleSelect,
    });
  }

  listRolePermissions(roleId: string) {
    return this.prisma.rolePermission.findMany({
      where: { roleId },
      select: { permission: { select: permissionSelect } },
      orderBy: { permission: { code: 'asc' } },
    });
  }

  assignRolePermission(
    roleId: string,
    permissionId: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      create: { roleId, permissionId },
      update: {},
      select: { permission: { select: permissionSelect } },
    });
  }

  removeRolePermission(
    roleId: string,
    permissionId: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.rolePermission.deleteMany({
      where: { roleId, permissionId },
    });
  }

  listPermissions(query: PermissionListQuery) {
    const where: Prisma.PermissionWhereInput = {
      ...(query.search
        ? {
            OR: [
              {
                code: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                resource: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                action: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      ...(query.resource ? { resource: query.resource } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.guardName ? { guardName: query.guardName } : {}),
      ...(query.createdFrom === undefined && query.createdTo === undefined
        ? {}
        : {
            createdAt: {
              ...(query.createdFrom ? { gte: query.createdFrom } : {}),
              ...(query.createdTo ? { lt: query.createdTo } : {}),
            },
          }),
    };
    return Promise.all([
      this.prisma.permission.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: 'asc' }],
        select: permissionSelect,
      }),
      this.prisma.permission.count({ where }),
    ]);
  }

  findPermissionDetail(id: string) {
    return this.prisma.permission.findUnique({
      where: { id },
      select: {
        ...permissionSelect,
        _count: {
          select: {
            rolePermissions: true,
            userPermissions: true,
            userBranchPermissions: true,
          },
        },
      },
    });
  }

  createPermission(
    data: Prisma.PermissionUncheckedCreateInput,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.permission.create({ data, select: permissionSelect });
  }

  updatePermission(id: string, data: Prisma.PermissionUpdateInput) {
    return this.prisma.permission.update({
      where: { id },
      data,
      select: permissionSelect,
    });
  }

  deletePermissionIfUnused(id: string) {
    return this.prisma.permission.deleteMany({
      where: {
        id,
        rolePermissions: { none: {} },
        userPermissions: { none: {} },
        userBranchPermissions: { none: {} },
      },
    });
  }

  listBranches(
    branchWhere: BranchWhere,
    skip: number,
    take: number,
    search: string | undefined,
    isActive: boolean | undefined,
    createdFrom: Date | undefined,
    createdToExclusive: Date | undefined,
    sortBy: BranchSortField,
    sortOrder: 'asc' | 'desc',
  ) {
    const scopeWhere = this.toBranchWhere(branchWhere);
    const filters: Prisma.BranchWhereInput[] = [scopeWhere];
    if (search) {
      filters.push({
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (isActive !== undefined) filters.push({ isActive });
    if (createdFrom || createdToExclusive) {
      filters.push({
        createdAt: {
          ...(createdFrom ? { gte: createdFrom } : {}),
          ...(createdToExclusive ? { lt: createdToExclusive } : {}),
        },
      });
    }
    const where: Prisma.BranchWhereInput = { AND: filters };
    return Promise.all([
      this.prisma.branch.findMany({
        where,
        skip,
        take,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        select: branchSelect,
      }),
      this.prisma.branch.count({ where }),
    ]);
  }

  findBranchInScope(id: string, branchWhere: BranchWhere) {
    return this.prisma.branch.findFirst({
      where: { id, ...this.toBranchWhere(branchWhere) },
      select: branchSelect,
    });
  }

  createBranch(data: Prisma.BranchUncheckedCreateInput) {
    return this.prisma.branch.create({ data, select: branchSelect });
  }

  updateBranch(id: string, data: Prisma.BranchUpdateInput) {
    return this.prisma.branch.update({
      where: { id },
      data,
      select: branchSelect,
    });
  }

  updateBranchInScope(
    id: string,
    branchWhere: BranchWhere,
    data: BranchLifecycleUpdate,
  ) {
    return this.transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id, ...this.toBranchWhere(branchWhere) },
        select: { id: true, isActive: true },
      });
      if (!branch) {
        throw new AuthorizationWriteScopeError('Branch nằm ngoài phạm vi');
      }
      if (branch.isActive && data.isActive === false) {
        const activeAssignments = await tx.userBranch.count({
          where: { branchId: id, isActive: true },
        });
        if (activeAssignments > 0) {
          throw new AuthorizationWriteConflictError(
            'Không thể deactivate branch khi còn user assignment active',
          );
        }
      }
      return tx.branch.update({ where: { id }, data, select: branchSelect });
    });
  }

  deactivateBranchInScope(id: string, branchWhere: BranchWhere) {
    return this.updateBranchInScope(id, branchWhere, { isActive: false });
  }

  async listStaff(query: StaffListQuery) {
    const where: Prisma.UserBranchWhereInput = {
      branchId: query.branchId,
      ...(query.assignmentIsActive === undefined
        ? {}
        : { isActive: query.assignmentIsActive }),
      ...(query.isPrimary === undefined ? {} : { isPrimary: query.isPrimary }),
      user: {
        type: UserType.BRANCH,
        ...(query.userIsActive === undefined
          ? {}
          : { isActive: query.userIsActive }),
        ...(query.search
          ? {
              OR: [
                {
                  fullName: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  email: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  phone: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      roles: {
        some: {
          ...(query.roleId ? { roleId: query.roleId } : {}),
          role: qualifyingStaffRoleWhere,
        },
      },
    };
    const [assignments, total] = await Promise.all([
      this.prisma.userBranch.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: staffOrderBy(query.sortBy, query.sortOrder),
        select: staffAssignmentSelect,
      }),
      this.prisma.userBranch.count({ where }),
    ]);
    return [assignments, total] as const;
  }

  findStaffInBranch(userId: string, branchId: string) {
    return this.prisma.userBranch.findFirst({
      where: {
        userId,
        branchId,
        user: { type: UserType.BRANCH },
        roles: { some: { role: qualifyingStaffRoleWhere } },
      },
      select: staffAssignmentSelect,
    });
  }

  async listStaffCandidates(input: {
    branchId: string;
    skip: number;
    take: number;
    search?: string;
  }) {
    const where: Prisma.UserWhereInput = {
      type: UserType.BRANCH,
      userBranches: { none: { branchId: input.branchId } },
      ...(input.search
        ? {
            OR: [
              {
                fullName: {
                  contains: input.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                email: {
                  contains: input.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                phone: {
                  contains: input.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: input.skip,
        take: input.take,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          isActive: true,
          _count: { select: { userBranches: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return [users, total] as const;
  }

  assignExistingStaff(input: {
    userId: string;
    branchId: string;
    roleIds: string[];
    permissionIds?: string[];
    assignedBy: string;
    actorMaxRoleLevel: number;
    allowedPermissionCodes: string[];
  }) {
    return this.transaction(async (tx) => {
      const [target, branch, roleCount, permissionCount] = await Promise.all([
        tx.user.findFirst({
          where: { id: input.userId, type: UserType.BRANCH },
          select: {
            id: true,
            userBranches: {
              where: { isActive: true },
              select: { isPrimary: true },
            },
          },
        }),
        tx.branch.findFirst({
          where: { id: input.branchId, isActive: true },
          select: { id: true },
        }),
        tx.role.count({
          where: {
            id: { in: input.roleIds },
            ...qualifyingStaffRoleWhere,
            level: { lt: input.actorMaxRoleLevel },
          },
        }),
        tx.permission.count({
          where: {
            id: { in: input.permissionIds ?? [] },
            guardName: 'web',
            code: {
              in: input.allowedPermissionCodes,
              notIn: [...DANGEROUS_PERMISSION_CODES],
            },
          },
        }),
      ]);
      if (!target || !branch) {
        throw new AuthorizationWriteValidationError(
          'Tài khoản nội bộ hoặc chi nhánh không còn hợp lệ',
        );
      }
      if (
        roleCount !== input.roleIds.length ||
        permissionCount !== (input.permissionIds?.length ?? 0)
      ) {
        throw new AuthorizationWriteValidationError(
          'Role hoặc permission đã thay đổi trước khi ghi dữ liệu',
        );
      }
      const existing = await tx.userBranch.findUnique({
        where: {
          userId_branchId: {
            userId: input.userId,
            branchId: input.branchId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw new AuthorizationWriteConflictError(
          'Tài khoản đã được phân công tại chi nhánh này',
        );
      }

      const assignment = await tx.userBranch.create({
        data: {
          userId: input.userId,
          branchId: input.branchId,
          assignedBy: input.assignedBy,
          isActive: true,
          isPrimary: target.userBranches.length === 0,
        },
        select: { id: true },
      });
      await tx.userBranchRole.createMany({
        data: input.roleIds.map((roleId) => ({
          userBranchId: assignment.id,
          roleId,
          assignedBy: input.assignedBy,
        })),
      });
      if (input.permissionIds?.length) {
        await tx.userBranchPermission.createMany({
          data: input.permissionIds.map((permissionId) => ({
            userBranchId: assignment.id,
            permissionId,
            effect: PermissionEffect.ALLOW,
            assignedBy: input.assignedBy,
          })),
        });
      }
      return tx.userBranch.findUniqueOrThrow({
        where: { id: assignment.id },
        select: staffAssignmentSelect,
      });
    });
  }

  async listManagedUsers(
    kind: 'STAFF' | 'BRANCH_ADMIN',
    branchWhere: BranchWhere,
    skip: number,
    take: number,
    search?: string,
    filters?: ManagedUserListFilters,
    sortBy: BranchAdminSortField = BranchAdminSortField.CREATED_AT,
    sortOrder: Prisma.SortOrder = 'desc',
  ) {
    const assignmentPredicate: Prisma.UserBranchWhereInput =
      kind === 'BRANCH_ADMIN'
        ? {
            roles: {
              some: {
                role: {
                  code: 'BRANCH_ADMIN',
                  type: UserType.BRANCH,
                  guardName: 'web',
                  isActive: true,
                },
              },
            },
          }
        : {};
    const assignmentFilter: Prisma.UserBranchListRelationFilter | undefined =
      filters?.assignedBranchId
        ? filters.assignmentState === BranchAdminAssignmentState.UNASSIGNED
          ? {
              none: {
                ...assignmentPredicate,
                branchId: filters.assignedBranchId,
              },
            }
          : {
              some: {
                ...assignmentPredicate,
                branchId: filters.assignedBranchId,
                ...(filters.assignmentState ===
                BranchAdminAssignmentState.ACTIVE
                  ? { isActive: true }
                  : filters.assignmentState ===
                      BranchAdminAssignmentState.INACTIVE_ONLY
                    ? { isActive: false }
                    : filters.assignmentIsActive === undefined
                      ? {}
                      : { isActive: filters.assignmentIsActive }),
              },
            }
        : filters?.assignmentState === BranchAdminAssignmentState.UNASSIGNED
          ? { none: assignmentPredicate }
          : filters?.assignmentState === BranchAdminAssignmentState.ACTIVE
            ? {
                some: { ...assignmentPredicate, isActive: true },
                ...(filters.excludeAssignedBranchId
                  ? {
                      none: {
                        ...assignmentPredicate,
                        branchId: filters.excludeAssignedBranchId,
                      },
                    }
                  : {}),
              }
            : filters?.assignmentState ===
                BranchAdminAssignmentState.INACTIVE_ONLY
              ? {
                  some: assignmentPredicate,
                  none: filters.excludeAssignedBranchId
                    ? {
                        ...assignmentPredicate,
                        OR: [
                          { isActive: true },
                          { branchId: filters.excludeAssignedBranchId },
                        ],
                      }
                    : { ...assignmentPredicate, isActive: true },
                }
              : filters?.excludeAssignedBranchId
                ? {
                    none: {
                      ...assignmentPredicate,
                      branchId: filters.excludeAssignedBranchId,
                    },
                  }
                : undefined;
    const where: Prisma.UserWhereInput = {
      ...this.managedUserWhere(kind, branchWhere),
      ...(filters?.isActive === undefined
        ? {}
        : { isActive: filters.isActive }),
      ...(assignmentFilter ? { userBranches: assignmentFilter } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { fullName: { contains: search, mode: 'insensitive' as const } },
              ...(kind === 'BRANCH_ADMIN'
                ? [
                    {
                      phone: {
                        contains: search,
                        mode: 'insensitive' as const,
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };
    const orderBy =
      kind === 'BRANCH_ADMIN'
        ? branchAdminOrderBy(sortBy, sortOrder)
        : [{ createdAt: 'desc' as const }];
    const computedSort = kind === 'BRANCH_ADMIN' && orderBy === undefined;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        ...(computedSort ? {} : { skip, take }),
        ...(orderBy ? { orderBy } : {}),
        select: managedUserSelect(
          branchWhere,
          kind === 'BRANCH_ADMIN' ? 'BRANCH_ADMIN' : 'ALL',
        ),
      }),
      this.prisma.user.count({ where }),
    ]);

    if (!computedSort) return [items, total] as const;

    items.sort((left, right) => {
      let compared = 0;
      if (sortBy === BranchAdminSortField.PRIMARY_BRANCH) {
        const leftName = left.userBranches.find(
          (assignment) => assignment.isPrimary,
        )?.branch.name;
        const rightName = right.userBranches.find(
          (assignment) => assignment.isPrimary,
        )?.branch.name;
        compared = compareNullableText(leftName, rightName, sortOrder);
      } else {
        const leftActive = left.userBranches.filter(
          (assignment) => assignment.isActive,
        ).length;
        const rightActive = right.userBranches.filter(
          (assignment) => assignment.isActive,
        ).length;
        compared = (leftActive - rightActive) * (sortOrder === 'asc' ? 1 : -1);
        if (compared === 0) {
          compared =
            (left.userBranches.length - right.userBranches.length) *
            (sortOrder === 'asc' ? 1 : -1);
        }
      }
      return compared || left.id.localeCompare(right.id);
    });

    return [items.slice(skip, skip + take), total] as const;
  }

  findManagedUserInScope(
    id: string,
    kind: 'STAFF' | 'BRANCH_ADMIN',
    branchWhere: BranchWhere,
  ) {
    return this.prisma.user.findFirst({
      where: { id, ...this.managedUserWhere(kind, branchWhere) },
      select: managedUserSelect(branchWhere),
    });
  }

  findStaffAssignments(userId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: userId,
        type: UserType.BRANCH,
        userBranches: {
          some: {
            roles: {
              some: {
                role: {
                  type: UserType.BRANCH,
                  guardName: 'web',
                  isActive: true,
                  code: { notIn: ['BRANCH_ADMIN', 'SUPER_ADMIN', 'CUSTOMER'] },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        gender: true,
        birthday: true,
        type: true,
        isActive: true,
        userBranches: {
          orderBy: [
            { isPrimary: 'desc' },
            { isActive: 'desc' },
            { branch: { code: 'asc' } },
            { id: 'asc' },
          ],
          select: {
            id: true,
            branchId: true,
            isActive: true,
            isPrimary: true,
            assignedAt: true,
            assignedBy: true,
            branch: {
              select: { id: true, code: true, name: true, isActive: true },
            },
            roles: {
              orderBy: { role: { code: 'asc' } },
              select: {
                id: true,
                role: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    level: true,
                    isActive: true,
                    isSystem: true,
                    type: true,
                    guardName: true,
                  },
                },
              },
            },
            permissions: {
              orderBy: { permission: { code: 'asc' } },
              select: {
                id: true,
                effect: true,
                permission: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    resource: true,
                    action: true,
                    guardName: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  findActiveBranchesByIds(ids: string[]) {
    return this.prisma.branch.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true },
    });
  }

  findActiveRolesByIds(ids: string[]) {
    return this.prisma.role.findMany({
      where: { id: { in: ids }, isActive: true },
      select: roleSelect,
    });
  }

  findPermissionsByIds(ids: string[]) {
    return this.prisma.permission.findMany({
      where: { id: { in: ids } },
      select: permissionSelect,
    });
  }

  findActiveRoleByCode(code: string) {
    return this.prisma.role.findFirst({
      where: { code, isActive: true },
      select: roleSelect,
    });
  }

  findActiveSystemRoleByCode(
    code: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.role.findFirst({
      where: { code, isActive: true, isSystem: true },
      select: { id: true },
    });
  }

  createInternalUser(input: {
    email: string;
    fullName: string;
    phone?: string;
    passwordHash: string;
    type: UserType;
    roleIds: string[];
    permissionIds?: string[];
    branchIds: string[];
    assignedBy: string;
    actorMaxRoleLevel: number;
    allowedPermissionCodes: string[];
    requiredRoleCode?: string;
  }) {
    return this.transaction(async (tx) => {
      const [roleCount, permissionCount, branchCount] = await Promise.all([
        tx.role.count({
          where: {
            id: { in: input.roleIds },
            type: input.type,
            guardName: 'web',
            isActive: true,
            level: { lt: input.actorMaxRoleLevel },
            ...(input.requiredRoleCode
              ? { code: input.requiredRoleCode }
              : { code: { notIn: ['SUPER_ADMIN', 'BRANCH_ADMIN'] } }),
          },
        }),
        tx.permission.count({
          where: {
            id: { in: input.permissionIds ?? [] },
            guardName: 'web',
            code: {
              in: input.allowedPermissionCodes,
              notIn: [...DANGEROUS_PERMISSION_CODES],
            },
          },
        }),
        tx.branch.count({
          where: { id: { in: input.branchIds }, isActive: true },
        }),
      ]);
      if (
        roleCount !== input.roleIds.length ||
        permissionCount !== (input.permissionIds?.length ?? 0) ||
        branchCount !== input.branchIds.length
      ) {
        throw new AuthorizationWriteValidationError(
          'Role, permission hoặc branch đã thay đổi trước khi ghi dữ liệu',
        );
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          phone: input.phone,
          passwordHash: input.passwordHash,
          provider: AuthProvider.LOCAL,
          type: input.type,
        },
      });
      if (input.type === UserType.BRANCH) {
        if (input.requiredRoleCode === 'BRANCH_ADMIN') {
          await tx.userRole.createMany({
            data: input.roleIds.map((roleId) => ({
              userId: user.id,
              roleId,
              assignedBy: input.assignedBy,
            })),
          });
        }
        for (const [index, branchId] of input.branchIds.entries()) {
          const userBranch = await tx.userBranch.create({
            data: {
              userId: user.id,
              branchId,
              assignedBy: input.assignedBy,
              isPrimary: index === 0,
              isActive: true,
            },
            select: { id: true },
          });
          await tx.userBranchRole.createMany({
            data: input.roleIds.map((roleId) => ({
              userBranchId: userBranch.id,
              roleId,
              assignedBy: input.assignedBy,
            })),
          });
          if (input.permissionIds?.length) {
            await tx.userBranchPermission.createMany({
              data: input.permissionIds.map((permissionId) => ({
                userBranchId: userBranch.id,
                permissionId,
                assignedBy: input.assignedBy,
                effect: 'ALLOW',
              })),
            });
          }
        }
      } else {
        await tx.userRole.createMany({
          data: input.roleIds.map((roleId) => ({
            userId: user.id,
            roleId,
            assignedBy: input.assignedBy,
          })),
        });
        if (input.permissionIds?.length) {
          await tx.userPermission.createMany({
            data: input.permissionIds.map((permissionId) => ({
              userId: user.id,
              permissionId,
              assignedBy: input.assignedBy,
              effect: 'ALLOW',
            })),
          });
        }
      }
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: managedUserSelect(),
      });
    });
  }

  async convertToBranchAdmin(
    userId: string,
    roleId: string,
    branchIds: string[],
    assignedBy: string,
  ) {
    return this.transaction(async (tx) => {
      const [role, branchCount] = await Promise.all([
        tx.role.findFirst({
          where: {
            id: roleId,
            code: 'BRANCH_ADMIN',
            type: UserType.BRANCH,
            guardName: 'web',
            isActive: true,
          },
          select: { id: true },
        }),
        tx.branch.count({
          where: { id: { in: branchIds }, isActive: true },
        }),
      ]);
      if (!role || branchCount !== branchIds.length) {
        throw new AuthorizationWriteValidationError(
          'Role hoặc branch đã thay đổi trước khi chuyển Branch Admin',
        );
      }
      const target = await tx.user.findFirst({
        where: { id: userId, type: UserType.CUSTOMER },
        select: { id: true },
      });
      if (!target) {
        throw new AuthorizationWriteValidationError(
          'User không còn là CUSTOMER hợp lệ',
        );
      }

      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userPermission.deleteMany({
        where: { userId },
      });
      await tx.userBranch.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: { type: UserType.BRANCH },
      });
      await tx.userRole.create({
        data: { userId, roleId, assignedBy },
      });
      for (const [index, branchId] of branchIds.entries()) {
        const userBranch = await tx.userBranch.create({
          data: {
            userId,
            branchId,
            assignedBy,
            isPrimary: index === 0,
            isActive: true,
          },
          select: { id: true },
        });
        await tx.userBranchRole.create({
          data: { userBranchId: userBranch.id, roleId, assignedBy },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: managedUserSelect(),
      });
    });
  }

  convertCustomerToStaff(input: {
    userId: string;
    assignedBy: string;
    branchAssignments: Array<{
      branchId: string;
      isPrimary: boolean;
      roleIds: string[];
      permissions: Array<{ permissionId: string; effect: PermissionEffect }>;
    }>;
  }) {
    return this.transaction(async (tx) => {
      const branchIds = input.branchAssignments.map(({ branchId }) => branchId);
      const roleIds = [
        ...new Set(input.branchAssignments.flatMap(({ roleIds }) => roleIds)),
      ];
      const permissionIds = [
        ...new Set(
          input.branchAssignments.flatMap(({ permissions }) =>
            permissions.map(({ permissionId }) => permissionId),
          ),
        ),
      ];
      const [target, branchCount, roleCount, permissionCount] =
        await Promise.all([
          tx.user.findFirst({
            where: {
              id: input.userId,
              type: UserType.CUSTOMER,
              isActive: true,
            },
            select: { id: true },
          }),
          tx.branch.count({
            where: { id: { in: branchIds }, isActive: true },
          }),
          tx.role.count({
            where: {
              id: { in: roleIds },
              type: UserType.BRANCH,
              guardName: 'web',
              isActive: true,
              code: { notIn: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'CUSTOMER'] },
            },
          }),
          tx.permission.count({
            where: {
              id: { in: permissionIds },
              guardName: 'web',
              code: { notIn: [...DANGEROUS_PERMISSION_CODES] },
            },
          }),
        ]);
      if (!target) {
        throw new AuthorizationWriteValidationError(
          'User không còn là CUSTOMER hợp lệ',
        );
      }
      if (
        branchCount !== branchIds.length ||
        roleCount !== roleIds.length ||
        permissionCount !== permissionIds.length
      ) {
        throw new AuthorizationWriteValidationError(
          'Branch, role hoặc permission không hợp lệ',
        );
      }
      await tx.userRole.deleteMany({ where: { userId: input.userId } });
      await tx.userPermission.deleteMany({ where: { userId: input.userId } });
      await tx.userBranch.deleteMany({ where: { userId: input.userId } });
      await tx.user.update({
        where: { id: input.userId },
        data: { type: UserType.BRANCH },
      });
      for (const assignment of input.branchAssignments) {
        const userBranch = await tx.userBranch.create({
          data: {
            userId: input.userId,
            branchId: assignment.branchId,
            isPrimary: assignment.isPrimary,
            assignedBy: input.assignedBy,
            isActive: true,
          },
          select: { id: true },
        });
        await tx.userBranchRole.createMany({
          data: assignment.roleIds.map((roleId) => ({
            userBranchId: userBranch.id,
            roleId,
            assignedBy: input.assignedBy,
          })),
        });
        if (assignment.permissions.length > 0) {
          await tx.userBranchPermission.createMany({
            data: assignment.permissions.map(({ permissionId, effect }) => ({
              userBranchId: userBranch.id,
              permissionId,
              effect,
              assignedBy: input.assignedBy,
            })),
          });
        }
      }
      return tx.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: managedUserSelect(),
      });
    });
  }

  updateManagedUserInScope(
    id: string,
    branchWhere: BranchWhere,
    data: Prisma.UserUpdateInput,
    assertAllowed: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    return this.transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id, ...this.managedUserWhere('STAFF', branchWhere) },
        select: { id: true },
      });
      if (!user) {
        throw new AuthorizationWriteScopeError(
          'Người dùng nằm ngoài phạm vi chi nhánh',
        );
      }
      await assertAllowed(tx);
      return tx.user.update({
        where: { id },
        data,
        select: managedUserSelect(branchWhere),
      });
    });
  }

  disableUser(
    id: string,
    branchWhere: BranchWhere,
    assertAllowed: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    return this.transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id, ...this.managedUserWhere('STAFF', branchWhere) },
        select: { id: true },
      });
      if (!user) {
        throw new AuthorizationWriteScopeError(
          'Người dùng nằm ngoài phạm vi chi nhánh',
        );
      }
      await assertAllowed(tx);
      await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.user.update({
        where: { id },
        data: { isActive: false },
        select: managedUserSelect(),
      });
    });
  }

  offboardUserFromBranch(
    userId: string,
    branchId: string,
    assertAllowed: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    return this.transaction(async (tx) => {
      const assignment = await tx.userBranch.findFirst({
        where: {
          userId,
          branchId,
          isActive: true,
          branch: { isActive: true },
          roles: {
            some: {
              role: {
                type: UserType.BRANCH,
                code: {
                  notIn: ['BRANCH_ADMIN', 'SUPER_ADMIN', 'CUSTOMER'],
                },
                isActive: true,
              },
            },
          },
        },
        select: { id: true, isPrimary: true },
      });
      if (!assignment) {
        throw new AuthorizationWriteScopeError(
          'Người dùng không thuộc selected branch',
        );
      }
      await assertAllowed(tx);
      await tx.userBranch.update({
        where: { id: assignment.id },
        data: { isActive: false, isPrimary: false },
      });
      const remaining = await tx.userBranch.findMany({
        where: {
          userId,
          isActive: true,
          branch: { isActive: true },
        },
        orderBy: [{ assignedAt: 'asc' }, { id: 'asc' }],
        select: { id: true, isPrimary: true },
      });
      if (assignment.isPrimary && remaining.length > 0) {
        await tx.userBranch.update({
          where: { id: remaining[0].id },
          data: { isPrimary: true },
        });
      }
      if (remaining.length === 0) {
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.user.update({
          where: { id: userId },
          data: { isActive: false },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: managedUserSelect({
          scope: 'FILTERED',
          where: { branchId },
        }),
      });
    });
  }

  assignUserRole(
    userBranchId: string,
    roleId: string,
    assignedBy: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.userBranchRole.upsert({
      where: { userBranchId_roleId: { userBranchId, roleId } },
      create: { userBranchId, roleId, assignedBy },
      update: { assignedBy, assignedAt: new Date() },
    });
  }

  async removeUserRole(
    userBranchId: string,
    roleId: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    const mapping = await client.userBranchRole.findUnique({
      where: { userBranchId_roleId: { userBranchId, roleId } },
      select: {
        id: true,
        role: {
          select: { code: true, type: true, guardName: true, isActive: true },
        },
      },
    });
    if (!mapping) return { count: 0 };

    const isQualifyingStaffRole =
      mapping.role.type === UserType.BRANCH &&
      mapping.role.guardName === 'web' &&
      mapping.role.isActive &&
      !['BRANCH_ADMIN', 'SUPER_ADMIN', 'CUSTOMER'].includes(mapping.role.code);
    if (isQualifyingStaffRole) {
      const qualifyingRoleCount = await client.userBranchRole.count({
        where: {
          userBranchId,
          role: {
            type: UserType.BRANCH,
            guardName: 'web',
            isActive: true,
            code: { notIn: ['BRANCH_ADMIN', 'SUPER_ADMIN', 'CUSTOMER'] },
          },
        },
      });
      if (qualifyingRoleCount <= 1) {
        throw new StaffLastRoleRequiredError(
          'Không thể gỡ role Staff cuối cùng khỏi assignment đang active',
        );
      }
    }

    return client.userBranchRole.deleteMany({
      where: { userBranchId, roleId },
    });
  }

  upsertUserPermission(
    userBranchId: string,
    permissionId: string,
    effect: 'ALLOW' | 'DENY',
    assignedBy: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.userBranchPermission.upsert({
      where: { userBranchId_permissionId: { userBranchId, permissionId } },
      create: { userBranchId, permissionId, effect, assignedBy },
      update: { effect, assignedBy, assignedAt: new Date() },
    });
  }

  removeUserPermission(
    userBranchId: string,
    permissionId: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
    return client.userBranchPermission.deleteMany({
      where: { userBranchId, permissionId },
    });
  }

  assignUserBranch(
    userId: string,
    branchId: string,
    assignedBy: string,
    roleCode: 'STAFF' | 'BRANCH_ADMIN',
  ) {
    return this.transaction(async (tx) => {
      const [branch, target] = await Promise.all([
        tx.branch.findFirst({
          where: { id: branchId, isActive: true },
          select: { id: true },
        }),
        tx.user.findFirst({
          where: {
            id: userId,
            type: UserType.BRANCH,
            ...(roleCode === 'BRANCH_ADMIN'
              ? {
                  userRoles: {
                    some: {
                      role: {
                        code: 'BRANCH_ADMIN',
                        type: UserType.BRANCH,
                        guardName: 'web',
                      },
                    },
                  },
                }
              : {}),
          },
          select: { id: true },
        }),
      ]);
      if (!branch || !target) {
        throw new AuthorizationWriteValidationError(
          'Branch hoặc user BRANCH không hợp lệ',
        );
      }
      const fallbackRole = await tx.role.findFirst({
        where: {
          code: roleCode,
          type: UserType.BRANCH,
          isActive: true,
        },
        select: { id: true },
      });
      if (!fallbackRole) {
        throw new AuthorizationWriteValidationError(
          'Không tìm thấy role mặc định cho branch assignment',
        );
      }
      const assignmentSelect = {
        id: true,
        userId: true,
        branchId: true,
        isPrimary: true,
        isActive: true,
      } satisfies Prisma.UserBranchSelect;
      const assignment = await tx.userBranch.upsert({
        where: { userId_branchId: { userId, branchId } },
        create: { userId, branchId, assignedBy },
        update: { isActive: true, assignedBy, assignedAt: new Date() },
        select: assignmentSelect,
      });
      if (roleCode === 'BRANCH_ADMIN') {
        await tx.userRole.upsert({
          where: {
            userId_roleId: { userId, roleId: fallbackRole.id },
          },
          create: {
            userId,
            roleId: fallbackRole.id,
            assignedBy,
          },
          update: {},
        });
      }
      await tx.userBranchRole.upsert({
        where: {
          userBranchId_roleId: {
            userBranchId: assignment.id,
            roleId: fallbackRole.id,
          },
        },
        create: {
          userBranchId: assignment.id,
          roleId: fallbackRole.id,
          assignedBy,
        },
        update: { assignedBy, assignedAt: new Date() },
      });
      return assignment;
    });
  }

  transferStaffBranch(input: {
    userId: string;
    fromBranchId: string;
    toBranchId: string;
    destinationRoleIds: string[];
    assignedBy: string;
  }) {
    return this.transaction(async (tx) => {
      const [target, sourceAssignment, destinationBranch, roleCount] =
        await Promise.all([
          tx.user.findFirst({
            where: {
              id: input.userId,
              type: UserType.BRANCH,
              isActive: true,
            },
            select: { id: true },
          }),
          tx.userBranch.findFirst({
            where: {
              userId: input.userId,
              branchId: input.fromBranchId,
              isActive: true,
              branch: { isActive: true },
              roles: {
                some: {
                  role: {
                    type: UserType.BRANCH,
                    guardName: 'web',
                    isActive: true,
                    code: {
                      notIn: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'CUSTOMER'],
                    },
                  },
                },
              },
            },
            select: { id: true, isPrimary: true },
          }),
          tx.branch.findFirst({
            where: { id: input.toBranchId, isActive: true },
            select: { id: true },
          }),
          tx.role.count({
            where: {
              id: { in: input.destinationRoleIds },
              type: UserType.BRANCH,
              guardName: 'web',
              isActive: true,
              code: { notIn: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'CUSTOMER'] },
            },
          }),
        ]);
      if (!target) {
        throw new AuthorizationWriteValidationError(
          'Target không phải user BRANCH active hợp lệ',
        );
      }
      if (!sourceAssignment) {
        throw new AuthorizationWriteScopeError(
          'Source branch không có Staff assignment active',
        );
      }
      if (!destinationBranch) {
        throw new AuthorizationWriteValidationError(
          'Destination branch không tồn tại hoặc inactive',
        );
      }
      if (roleCount !== input.destinationRoleIds.length) {
        throw new AuthorizationWriteValidationError(
          'Destination role không hợp lệ cho Staff',
        );
      }

      const existingDestination = await tx.userBranch.findUnique({
        where: {
          userId_branchId: {
            userId: input.userId,
            branchId: input.toBranchId,
          },
        },
        select: { id: true, isActive: true },
      });
      if (existingDestination?.isActive) {
        throw new AuthorizationWriteConflictError(
          'Staff đã có assignment active tại branch đích',
        );
      }

      const destinationAssignment = existingDestination
        ? await tx.userBranch.update({
            where: { id: existingDestination.id },
            data: {
              isActive: true,
              isPrimary: false,
              assignedBy: input.assignedBy,
              assignedAt: new Date(),
            },
            select: { id: true },
          })
        : await tx.userBranch.create({
            data: {
              userId: input.userId,
              branchId: input.toBranchId,
              isActive: true,
              isPrimary: false,
              assignedBy: input.assignedBy,
            },
            select: { id: true },
          });

      await tx.userBranchRole.deleteMany({
        where: { userBranchId: destinationAssignment.id },
      });
      await tx.userBranchRole.createMany({
        data: input.destinationRoleIds.map((roleId) => ({
          userBranchId: destinationAssignment.id,
          roleId,
          assignedBy: input.assignedBy,
        })),
      });
      await tx.userBranchPermission.deleteMany({
        where: { userBranchId: destinationAssignment.id },
      });

      if (sourceAssignment.isPrimary) {
        await tx.userBranch.updateMany({
          where: { userId: input.userId },
          data: { isPrimary: false },
        });
        await tx.userBranch.update({
          where: { id: destinationAssignment.id },
          data: { isPrimary: true },
        });
      }
      await tx.userBranch.update({
        where: { id: sourceAssignment.id },
        data: { isActive: false, isPrimary: false },
      });

      const activePrimaryCount = await tx.userBranch.count({
        where: {
          userId: input.userId,
          isActive: true,
          isPrimary: true,
          branch: { isActive: true },
        },
      });
      if (activePrimaryCount !== 1) {
        throw new AuthorizationWriteValidationError(
          'Primary branch invariant không hợp lệ sau transfer',
        );
      }

      return tx.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: managedUserSelect(),
      });
    });
  }

  setUserBranchActive(
    userId: string,
    branchId: string,
    isActive: boolean,
    kind: ManagedAssignmentKind,
    replacementBranchId?: string,
  ) {
    return this.transaction(async (tx) => {
      if (isActive) {
        const branch = await tx.branch.findFirst({
          where: { id: branchId, isActive: true },
          select: { id: true },
        });
        if (!branch) {
          throw new AuthorizationWriteValidationError(
            'Branch không còn hoạt động',
          );
        }
      }
      const assignment = await tx.userBranch.findFirst({
        where: {
          userId,
          branchId,
          roles: { some: { role: managedAssignmentRoleWhere(kind) } },
        },
        select: { id: true, isPrimary: true },
      });
      if (!assignment) {
        throw new AuthorizationWriteScopeError(
          `Không tìm thấy phân công ${kind} tại chi nhánh`,
        );
      }
      if (!isActive && assignment.isPrimary) {
        const replacements = await tx.userBranch.findMany({
          where: {
            userId,
            branchId: { not: branchId },
            isActive: true,
            branch: { isActive: true },
            roles: { some: { role: managedAssignmentRoleWhere(kind) } },
          },
          select: { branchId: true },
        });
        if (replacements.length > 0) {
          const replacementIsValid = replacements.some(
            (item) => item.branchId === replacementBranchId,
          );
          if (!replacementIsValid) {
            throw new AuthorizationWriteValidationError(
              'Phải chọn primary branch thay thế hợp lệ',
            );
          }
        }
        await tx.userBranch.update({
          where: { userId_branchId: { userId, branchId } },
          data: { isPrimary: false },
        });
        if (replacementBranchId) {
          await tx.userBranch.update({
            where: {
              userId_branchId: { userId, branchId: replacementBranchId },
            },
            data: { isPrimary: true, isActive: true },
          });
        }
      }
      const updated = await tx.userBranch.update({
        where: { userId_branchId: { userId, branchId } },
        data: { isActive },
      });
      if (!isActive) {
        const remainingActive = await tx.userBranch.count({
          where: {
            userId,
            isActive: true,
            branch: { isActive: true },
          },
        });
        if (remainingActive === 0) {
          await tx.authSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.user.update({
            where: { id: userId },
            data: { isActive: false },
          });
        }
      }
      return updated;
    });
  }

  removeUserBranch(
    userId: string,
    branchId: string,
    kind: ManagedAssignmentKind,
    replacementBranchId?: string,
  ) {
    return this.transaction(async (tx) => {
      const assignment = await tx.userBranch.findFirst({
        where: {
          userId,
          branchId,
          roles: { some: { role: managedAssignmentRoleWhere(kind) } },
        },
        select: { id: true, isPrimary: true },
      });
      if (!assignment) {
        if (kind === 'STAFF') return { count: 0 };
        throw new AuthorizationWriteScopeError(
          'Không tìm thấy phân công BRANCH_ADMIN tại chi nhánh',
        );
      }
      if (kind === 'BRANCH_ADMIN') {
        await tx.userBranchRole.deleteMany({
          where: {
            userBranchId: assignment.id,
            role: managedAssignmentRoleWhere(kind),
          },
        });
        const remainingRoleCount = await tx.userBranchRole.count({
          where: { userBranchId: assignment.id },
        });
        if (remainingRoleCount > 0) return { count: 1 };
      }
      if (assignment.isPrimary) {
        const replacements = await tx.userBranch.findMany({
          where: {
            userId,
            branchId: { not: branchId },
            isActive: true,
            branch: { isActive: true },
            roles: { some: { role: managedAssignmentRoleWhere(kind) } },
          },
          select: { branchId: true },
        });
        if (replacements.length > 0) {
          const replacementIsValid = replacements.some(
            (item) => item.branchId === replacementBranchId,
          );
          if (!replacementIsValid) {
            throw new AuthorizationWriteValidationError(
              'Phải chọn primary branch thay thế hợp lệ',
            );
          }
        }
      }
      if (assignment.isPrimary && replacementBranchId) {
        await tx.userBranch.updateMany({
          where: { userId },
          data: { isPrimary: false },
        });
        await tx.userBranch.update({
          where: {
            userId_branchId: { userId, branchId: replacementBranchId },
          },
          data: { isPrimary: true, isActive: true },
        });
      }
      const deletion = await tx.userBranch.deleteMany({
        where: { userId, branchId },
      });
      const remainingActive = await tx.userBranch.count({
        where: {
          userId,
          isActive: true,
          branch: { isActive: true },
        },
      });
      if (remainingActive === 0) {
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.user.update({
          where: { id: userId },
          data: { isActive: false },
        });
      }
      return deletion;
    });
  }

  listUserBranchAssignments(userId: string, kind: ManagedAssignmentKind) {
    return this.prisma.userBranch.findMany({
      where: {
        userId,
        roles: { some: { role: managedAssignmentRoleWhere(kind) } },
      },
      select: {
        branchId: true,
        isPrimary: true,
        isActive: true,
        branch: { select: { isActive: true } },
      },
    });
  }

  setPrimaryUserBranch(
    userId: string,
    branchId: string,
    assignedBy: string,
    kind: ManagedAssignmentKind,
  ) {
    return this.transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, isActive: true },
        select: { id: true },
      });
      if (!branch) {
        throw new AuthorizationWriteValidationError(
          'Branch không còn hoạt động',
        );
      }
      const assignment = await tx.userBranch.findFirst({
        where: {
          userId,
          branchId,
          isActive: true,
          branch: { isActive: true },
          roles: { some: { role: managedAssignmentRoleWhere(kind) } },
        },
        select: { branchId: true },
      });
      if (!assignment) {
        throw new AuthorizationWriteValidationError(
          'Chỉ có thể đặt primary cho assignment đang hoạt động',
        );
      }
      await tx.userBranch.updateMany({
        where: { userId },
        data: { isPrimary: false },
      });
      return tx.userBranch.update({
        where: { userId_branchId: { userId, branchId } },
        data: {
          assignedBy,
          isPrimary: true,
          assignedAt: new Date(),
        },
      });
    });
  }

  private toBranchWhere(branchWhere: BranchWhere): Prisma.BranchWhereInput {
    if (branchWhere.scope === 'UNRESTRICTED') {
      return {};
    }
    const branchId = branchWhere.where.branchId;
    return { id: typeof branchId === 'string' ? branchId : branchId };
  }

  private managedUserWhere(
    kind: 'STAFF' | 'BRANCH_ADMIN',
    branchWhere: BranchWhere,
  ): Prisma.UserWhereInput {
    const branchFilter =
      branchWhere.scope === 'UNRESTRICTED'
        ? {}
        : { branchId: branchWhere.where.branchId };
    return {
      type: UserType.BRANCH,
      ...(kind === 'BRANCH_ADMIN'
        ? {
            userRoles: {
              some: {
                role: {
                  code: 'BRANCH_ADMIN',
                  type: UserType.BRANCH,
                  guardName: 'web',
                },
              },
            },
          }
        : {}),
      ...(kind === 'STAFF'
        ? {
            userBranches: {
              some: {
                isActive: true,
                branch: { isActive: true },
                ...branchFilter,
                roles: {
                  some: {
                    role: {
                      type: UserType.BRANCH,
                      code: {
                        notIn: ['BRANCH_ADMIN', 'SUPER_ADMIN', 'CUSTOMER'],
                      },
                      isActive: true,
                    },
                  },
                },
              },
            },
          }
        : {}),
    };
  }
}
