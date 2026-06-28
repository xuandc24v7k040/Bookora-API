import { Injectable } from '@nestjs/common';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { PrismaService } from '@/database/prisma.service';
import {
  AuthProvider,
  PermissionEffect,
  Prisma,
  UserType,
} from '@/generated/prisma/client';
import type { AuthorizationTransactionClient } from './types/authorization-transaction.type';
import type { BranchWhere } from './types/branch-context.type';
import { DANGEROUS_PERMISSION_CODES } from './authorization.constants';

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
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BranchSelect;

function managedUserSelect(
  branchWhere: BranchWhere = { scope: 'UNRESTRICTED' },
) {
  const userBranchWhere: Prisma.UserBranchWhereInput =
    branchWhere.scope === 'UNRESTRICTED'
      ? {}
      : { branchId: branchWhere.where.branchId };
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
        branch: { select: branchSelect },
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

  listRoles(skip: number, take: number, search?: string) {
    const where: Prisma.RoleWhereInput = search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    return Promise.all([
      this.prisma.role.findMany({
        where,
        skip,
        take,
        orderBy: [{ level: 'desc' }, { code: 'asc' }],
        select: roleSelect,
      }),
      this.prisma.role.count({ where }),
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

  listPermissions(skip: number, take: number, search?: string) {
    const where: Prisma.PermissionWhereInput = search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};
    return Promise.all([
      this.prisma.permission.findMany({
        where,
        skip,
        take,
        orderBy: { code: 'asc' },
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

  createPermission(data: Prisma.PermissionUncheckedCreateInput) {
    return this.prisma.permission.create({ data, select: permissionSelect });
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

  listBranches(branchWhere: BranchWhere, skip: number, take: number) {
    const where = this.toBranchWhere(branchWhere);
    return Promise.all([
      this.prisma.branch.findMany({
        where,
        skip,
        take,
        orderBy: { code: 'asc' },
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
    data: Prisma.BranchUpdateInput,
  ) {
    return this.transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id, ...this.toBranchWhere(branchWhere) },
        select: { id: true },
      });
      if (!branch) {
        throw new AuthorizationWriteScopeError('Branch nằm ngoài phạm vi');
      }
      return tx.branch.update({ where: { id }, data, select: branchSelect });
    });
  }

  deactivateBranchInScope(id: string, branchWhere: BranchWhere) {
    return this.transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id, ...this.toBranchWhere(branchWhere) },
        select: { id: true },
      });
      if (!branch) {
        throw new AuthorizationWriteScopeError('Branch nằm ngoài phạm vi');
      }
      const activeAssignments = await tx.userBranch.count({
        where: { branchId: id, isActive: true },
      });
      if (activeAssignments > 0) {
        throw new AuthorizationWriteConflictError(
          'Không thể deactivate branch khi còn user assignment active',
        );
      }
      return tx.branch.update({
        where: { id },
        data: { isActive: false },
        select: branchSelect,
      });
    });
  }

  listManagedUsers(
    kind: 'STAFF' | 'BRANCH_ADMIN',
    branchWhere: BranchWhere,
    skip: number,
    take: number,
    search?: string,
  ) {
    const where: Prisma.UserWhereInput = {
      ...this.managedUserWhere(kind, branchWhere),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { fullName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    return Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: managedUserSelect(branchWhere),
      }),
      this.prisma.user.count({ where }),
    ]);
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
            where: { id: { in: permissionIds }, guardName: 'web' },
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

  removeUserRole(
    userBranchId: string,
    roleId: string,
    client: AuthorizationTransactionClient = this.prisma,
  ) {
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
          where: { id: userId, type: UserType.BRANCH },
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
      const assignment = await tx.userBranch.upsert({
        where: { userId_branchId: { userId, branchId } },
        create: { userId, branchId, assignedBy },
        update: { isActive: true, assignedBy, assignedAt: new Date() },
        select: {
          id: true,
          userId: true,
          branchId: true,
          isPrimary: true,
          isActive: true,
        },
      });
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
        const roleCount = await tx.userBranchRole.count({
          where: { userBranch: { userId, branchId } },
        });
        if (roleCount === 0) {
          throw new AuthorizationWriteValidationError(
            'Không thể activate branch assignment chưa có role',
          );
        }
      }
      const assignment = await tx.userBranch.findUniqueOrThrow({
        where: { userId_branchId: { userId, branchId } },
      });
      if (!isActive && assignment.isPrimary) {
        const replacements = await tx.userBranch.findMany({
          where: {
            userId,
            branchId: { not: branchId },
            isActive: true,
            branch: { isActive: true },
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
    replacementBranchId?: string,
  ) {
    return this.transaction(async (tx) => {
      const assignment = await tx.userBranch.findUniqueOrThrow({
        where: { userId_branchId: { userId, branchId } },
        select: { isPrimary: true },
      });
      if (assignment.isPrimary) {
        const replacements = await tx.userBranch.findMany({
          where: {
            userId,
            branchId: { not: branchId },
            isActive: true,
            branch: { isActive: true },
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

  listUserBranchAssignments(userId: string) {
    return this.prisma.userBranch.findMany({
      where: { userId },
      select: {
        branchId: true,
        isPrimary: true,
        isActive: true,
        branch: { select: { isActive: true } },
      },
    });
  }

  setPrimaryUserBranch(userId: string, branchId: string, assignedBy: string) {
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
      await tx.userBranch.findUniqueOrThrow({
        where: { userId_branchId: { userId, branchId } },
        select: { branchId: true },
      });
      await tx.userBranch.updateMany({
        where: { userId },
        data: { isPrimary: false },
      });
      return tx.userBranch.update({
        where: { userId_branchId: { userId, branchId } },
        data: {
          assignedBy,
          isPrimary: true,
          isActive: true,
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
            userBranches: {
              some: {
                isActive: true,
                branch: { isActive: true },
                ...branchFilter,
                roles: {
                  some: { role: { code: 'BRANCH_ADMIN', isActive: true } },
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
