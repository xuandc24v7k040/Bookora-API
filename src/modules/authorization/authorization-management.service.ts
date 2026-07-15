import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PermissionEffect, Prisma, UserType } from '@/generated/prisma/client';
import { PaginatedResponseDto } from '@/common/dto';
import {
  getPaginationOptions,
  getPrismaSortOrder,
} from '@/common/utils/pagination.util';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AUTHORIZATION_ERROR_CODES } from './authorization.constants';
import { authorizationForbidden } from './authorization.errors';
import {
  AuthorizationRepository,
  AuthorizationWriteConflictError,
  AuthorizationWriteScopeError,
  AuthorizationWriteValidationError,
  StaffLastRoleRequiredError,
} from './authorization.repository';
import { BranchContextService } from './branch-context.service';
import type {
  CatalogQueryDto,
  BranchListQueryDto,
  ConvertBranchAdminDto,
  ConvertStaffDto,
  CreateBranchDto,
  CreateInternalUserDto,
  CreatePermissionDto,
  CreateRoleDto,
  CreateStaffDto,
  TransferStaffBranchDto,
  UpdateBranchDto,
  UpdatePermissionDto,
  UpdateRoleDto,
  UpdateStaffDto,
} from './dto';

import { BranchSortField } from './dto';
import { DANGEROUS_PERMISSION_CODES } from './authorization.constants';
import { PermissionDelegationPolicy } from './policies/permission-delegation.policy';
import { RoleLevelPolicy } from './policies/role-level.policy';
import { SystemProtectionPolicy } from './policies/system-protection.policy';
import type { BranchContext, BranchWhere } from './types/branch-context.type';

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function startOfVietnamDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) - VIETNAM_UTC_OFFSET_MS);
}

function startOfNextVietnamDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1) - VIETNAM_UTC_OFFSET_MS);
}

@Injectable()
export class AuthorizationManagementService {
  constructor(
    private readonly repository: AuthorizationRepository,
    private readonly branchContextService: BranchContextService,
    private readonly roleLevelPolicy: RoleLevelPolicy,
    private readonly systemProtectionPolicy: SystemProtectionPolicy,
    private readonly permissionDelegationPolicy: PermissionDelegationPolicy,
  ) {}

  async listRoles(query: CatalogQueryDto) {
    const { page, limit, skip } = getPaginationOptions(query);
    const [items, total] = await this.repository.listRoles(
      skip,
      limit,
      query.search,
    );
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getRole(id: string) {
    const role = await this.repository.findRoleDetail(id);
    if (!role) throw new NotFoundException('Không tìm thấy role');
    return role;
  }

  createRole(actor: AuthenticatedUser, dto: CreateRoleDto) {
    this.systemProtectionPolicy.assertCanCreateRole(actor);
    return this.repository.createRole({
      ...dto,
      guardName: dto.guardName ?? 'web',
      isSystem: false,
      isActive: true,
    });
  }

  async updateRole(actor: AuthenticatedUser, id: string, dto: UpdateRoleDto) {
    await this.systemProtectionPolicy.assertCanUpdateRole(actor, id, dto);
    return this.repository.updateRole(id, dto);
  }

  async deactivateRole(actor: AuthenticatedUser, id: string) {
    const role = await this.getRole(id);
    return this.repository.transaction(async (tx) => {
      if (role.code === 'SUPER_ADMIN') {
        await this.systemProtectionPolicy.assertCanDeactivateSuperAdminRole(
          id,
          tx,
        );
      }
      await this.systemProtectionPolicy.assertCanDeleteRole(actor, id, tx);
      return this.repository.updateRole(id, { isActive: false }, tx);
    });
  }

  async listRolePermissions(roleId: string) {
    await this.getRole(roleId);
    return this.repository.listRolePermissions(roleId);
  }

  async assignRolePermission(
    actor: AuthenticatedUser,
    roleId: string,
    permissionId: string,
  ) {
    return this.repository.transaction(async (tx) => {
      await this.permissionDelegationPolicy.assertCanAssignRolePermission(
        actor,
        roleId,
        permissionId,
        tx,
      );
      return this.repository.assignRolePermission(roleId, permissionId, tx);
    });
  }

  async removeRolePermission(
    actor: AuthenticatedUser,
    roleId: string,
    permissionId: string,
  ) {
    return this.repository.transaction(async (tx) => {
      await this.permissionDelegationPolicy.assertCanRemoveRolePermission(
        actor,
        roleId,
        permissionId,
        tx,
      );
      return this.repository.removeRolePermission(roleId, permissionId, tx);
    });
  }

  async listPermissions(query: CatalogQueryDto) {
    const { page, limit, skip } = getPaginationOptions(query);
    const [items, total] = await this.repository.listPermissions(
      skip,
      limit,
      query.search,
    );
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getPermission(id: string) {
    const permission = await this.repository.findPermissionDetail(id);
    if (!permission) throw new NotFoundException('Không tìm thấy permission');
    return permission;
  }

  createPermission(actor: AuthenticatedUser, dto: CreatePermissionDto) {
    this.systemProtectionPolicy.assertCanCreatePermission(actor);
    this.assertPermissionCodeConsistency(dto.code, dto.resource, dto.action);
    return this.repository.createPermission({
      ...dto,
      guardName: dto.guardName ?? 'web',
    });
  }

  async updatePermission(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdatePermissionDto,
  ) {
    this.systemProtectionPolicy.assertCanUpdatePermission(actor);
    const current = await this.getPermission(id);
    const code = dto.code ?? current.code;
    const resource = dto.resource ?? current.resource;
    const action = dto.action ?? current.action;
    this.assertPermissionCodeConsistency(code, resource, action);
    if (
      !DANGEROUS_PERMISSION_CODES.has(current.code) &&
      DANGEROUS_PERMISSION_CODES.has(code)
    ) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.dangerousPermissionDenied,
        'Không được đổi permission thường thành permission nguy hiểm',
      );
    }
    return this.repository.updatePermission(id, dto);
  }

  async deletePermission(actor: AuthenticatedUser, id: string) {
    this.systemProtectionPolicy.assertCanDeletePermission(actor);
    const permission = await this.getPermission(id);
    if (
      permission._count.rolePermissions > 0 ||
      permission._count.userPermissions > 0 ||
      permission._count.userBranchPermissions > 0
    ) {
      throw new ConflictException('Permission đang được sử dụng');
    }
    const deletion = await this.repository.deletePermissionIfUnused(id);
    if (deletion.count !== 1) {
      throw new ConflictException('Permission đang được sử dụng');
    }
    return permission;
  }

  async listBranches(context: BranchContext, query: BranchListQueryDto) {
    const { page, limit, skip } = getPaginationOptions(query);
    const where = this.branchContextService.buildBranchWhere(context);
    const [items, total] = await this.repository.listBranches(
      where,
      skip,
      limit,
      query.search?.trim() || undefined,
      query.isActive,
      query.createdFrom ? startOfVietnamDate(query.createdFrom) : undefined,
      query.createdTo ? startOfNextVietnamDate(query.createdTo) : undefined,
      query.sortBy ?? BranchSortField.CODE,
      query.sortOrder ? getPrismaSortOrder(query.sortOrder) : 'asc',
    );
    return new PaginatedResponseDto(
      items.map((branch) => this.toBranchResponse(branch)),
      total,
      page,
      limit,
    );
  }

  async getBranch(context: BranchContext, id: string) {
    const branch = await this.repository.findBranchInScope(
      id,
      this.branchContextService.buildBranchWhere(context),
    );
    if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh');
    return this.toBranchResponse(branch);
  }

  async createBranch(actor: AuthenticatedUser, dto: CreateBranchDto) {
    this.assertSuperAdmin(actor);
    return this.toBranchResponse(
      await this.repository.createBranch({
        ...dto,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async updateBranch(
    actor: AuthenticatedUser,
    context: BranchContext,
    id: string,
    dto: UpdateBranchDto,
  ) {
    this.assertSuperAdmin(actor);
    const branchWhere = this.branchContextService.buildBranchWhere(context);
    return this.toBranchResponse(
      await this.runValidatedWrite(() =>
        this.repository.updateBranchInScope(id, branchWhere, dto),
      ),
    );
  }

  async deactivateBranch(
    actor: AuthenticatedUser,
    context: BranchContext,
    id: string,
  ) {
    this.assertSuperAdmin(actor);
    const branchWhere = this.branchContextService.buildBranchWhere(context);
    return this.toBranchResponse(
      await this.runValidatedWrite(() =>
        this.repository.deactivateBranchInScope(id, branchWhere),
      ),
    );
  }

  async listBranchAdmins(actor: AuthenticatedUser, query: CatalogQueryDto) {
    this.assertSuperAdmin(actor);
    return this.listManagedUsers(
      'BRANCH_ADMIN',
      { scope: 'UNRESTRICTED' },
      query,
    );
  }

  async getBranchAdmin(actor: AuthenticatedUser, id: string) {
    this.assertSuperAdmin(actor);
    return this.getManagedUser(id, 'BRANCH_ADMIN', { scope: 'UNRESTRICTED' });
  }

  async createBranchAdmin(
    actor: AuthenticatedUser,
    dto: CreateInternalUserDto,
  ) {
    this.assertSuperAdmin(actor);
    const branchIds = await this.validateActiveBranches(dto.branchIds);
    const role = await this.repository.findActiveRoleByCode('BRANCH_ADMIN');
    if (!role)
      throw new BadRequestException('Role BRANCH_ADMIN không hoạt động');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.runValidatedWrite(() =>
      this.repository.createInternalUser({
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash,
        type: UserType.BRANCH,
        roleIds: [role.id],
        branchIds,
        assignedBy: actor.id,
        actorMaxRoleLevel: actor.maxRoleLevel,
        allowedPermissionCodes: actor.permissions,
        requiredRoleCode: 'BRANCH_ADMIN',
      }),
    );
  }

  async convertToBranchAdmin(
    actor: AuthenticatedUser,
    userId: string,
    dto: ConvertBranchAdminDto,
  ) {
    this.assertSuperAdmin(actor);
    const target = await this.repository.findUserPolicySubject(userId);
    if (!target || target.type !== UserType.CUSTOMER) {
      throw new BadRequestException('Chỉ có thể chuyển CUSTOMER hợp lệ');
    }
    await this.roleLevelPolicy.assertCanManageExistingUser(actor, userId);
    const branchIds = await this.validateActiveBranches(dto.branchIds);
    const role = await this.repository.findActiveRoleByCode('BRANCH_ADMIN');
    if (!role)
      throw new BadRequestException('Role BRANCH_ADMIN không hoạt động');
    return this.runValidatedWrite(() =>
      this.repository.convertToBranchAdmin(
        userId,
        role.id,
        branchIds,
        actor.id,
      ),
    );
  }

  async convertToStaff(
    actor: AuthenticatedUser,
    userId: string,
    dto: ConvertStaffDto,
  ) {
    this.assertSuperAdmin(actor);
    const target = await this.repository.findUserPolicySubject(userId);
    if (!target || target.type !== UserType.CUSTOMER || !target.isActive) {
      throw new BadRequestException(
        'Only active CUSTOMER users can be converted',
      );
    }
    await this.roleLevelPolicy.assertCanManageExistingUser(actor, userId);
    const branchIds = dto.branchAssignments.map(({ branchId }) => branchId);
    if (new Set(branchIds).size !== branchIds.length) {
      throw new BadRequestException('Không được duplicate branch');
    }
    const primaryCount = dto.branchAssignments.filter(
      ({ isPrimary }) => isPrimary,
    ).length;
    if (primaryCount !== 1) {
      throw new BadRequestException('Phải có đúng một primary branch');
    }
    await this.validateActiveBranches(branchIds);
    for (const assignment of dto.branchAssignments) {
      for (const roleId of assignment.roleIds) {
        await this.roleLevelPolicy.assertCanAssignRoleToNewBranchUser(
          actor,
          roleId,
        );
      }
      const permissionIds =
        assignment.permissions?.map(({ permissionId }) => permissionId) ?? [];
      for (const permission of assignment.permissions ?? []) {
        await this.permissionDelegationPolicy.assertCanAssignInitialPermission(
          actor,
          permission.permissionId,
          permission.effect,
        );
      }
      if (new Set(permissionIds).size !== permissionIds.length) {
        throw new BadRequestException(
          'Không được duplicate permission trong cùng branch',
        );
      }
    }
    return this.runValidatedWrite(() =>
      this.repository.convertCustomerToStaff({
        userId,
        assignedBy: actor.id,
        branchAssignments: dto.branchAssignments.map((assignment) => ({
          branchId: assignment.branchId,
          isPrimary: assignment.isPrimary,
          roleIds: assignment.roleIds,
          permissions: assignment.permissions ?? [],
        })),
      }),
    );
  }

  async listStaff(context: BranchContext, query: CatalogQueryDto) {
    return this.listManagedUsers(
      'STAFF',
      this.branchContextService.buildBranchWhere(context),
      query,
    );
  }

  getStaff(context: BranchContext, id: string) {
    return this.getManagedUser(
      id,
      'STAFF',
      this.branchContextService.buildBranchWhere(context),
    );
  }

  async getStaffAssignments(actor: AuthenticatedUser, id: string) {
    this.assertSuperAdmin(actor);
    const user = await this.repository.findStaffAssignments(id);
    if (!user) {
      throw new NotFoundException('Không tìm thấy Staff');
    }
    const { userBranches, ...profile } = user;
    return {
      user: {
        ...profile,
        birthday: profile.birthday?.toISOString().slice(0, 10) ?? null,
      },
      assignments: userBranches,
    };
  }

  async createStaff(
    actor: AuthenticatedUser,
    context: BranchContext,
    dto: CreateStaffDto,
  ) {
    const selectedBranchId =
      this.branchContextService.requireSelectedBranch(context);
    for (const roleId of dto.roleIds) {
      await this.roleLevelPolicy.assertCanAssignRoleToNewBranchUser(
        actor,
        roleId,
      );
    }
    for (const permissionId of dto.permissionIds ?? []) {
      await this.permissionDelegationPolicy.assertCanAssignInitialPermission(
        actor,
        permissionId,
        PermissionEffect.ALLOW,
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.runValidatedWrite(() =>
      this.repository.createInternalUser({
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash,
        type: UserType.BRANCH,
        roleIds: dto.roleIds,
        permissionIds: dto.permissionIds,
        branchIds: [selectedBranchId],
        assignedBy: actor.id,
        actorMaxRoleLevel: actor.maxRoleLevel,
        allowedPermissionCodes: actor.permissions,
      }),
    );
  }

  async updateStaff(
    actor: AuthenticatedUser,
    context: BranchContext,
    id: string,
    dto: UpdateStaffDto,
  ) {
    const selectedBranchId =
      this.branchContextService.requireSelectedBranch(context);
    const branchWhere = this.branchContextService.buildBranchWhere(context);
    return this.runValidatedWrite(() =>
      this.repository.updateManagedUserInScope(id, branchWhere, dto, (tx) =>
        this.roleLevelPolicy.assertCanManageExistingBranchUser(
          actor,
          id,
          selectedBranchId,
          'staff.update',
          tx,
        ),
      ),
    );
  }

  async disableStaff(
    actor: AuthenticatedUser,
    context: BranchContext,
    id: string,
  ) {
    const selectedBranchId =
      this.branchContextService.requireSelectedBranch(context);
    return this.runValidatedWrite(() =>
      this.repository.offboardUserFromBranch(
        id,
        selectedBranchId,
        async (tx) => {
          await this.roleLevelPolicy.assertCanManageExistingBranchUser(
            actor,
            id,
            selectedBranchId,
            'staff.delete',
            tx,
          );
        },
      ),
    );
  }

  async assignUserRole(
    actor: AuthenticatedUser,
    context: BranchContext,
    userId: string,
    roleId: string,
  ) {
    const selectedBranchId =
      this.branchContextService.requireSelectedBranch(context);
    if (
      !actor.isSuperAdmin &&
      !actor.permissions.includes('staff.assign_role')
    ) {
      throw new ForbiddenException('Thiếu quyền gán role cho nhân viên');
    }
    return this.repository.transaction(async (tx) => {
      const targetBranch =
        await this.repository.findActiveUserBranchPolicySubject(
          userId,
          selectedBranchId,
          tx,
        );
      if (!targetBranch) {
        throw new NotFoundException('Người dùng không thuộc selected branch');
      }
      const role = await this.repository.findRolePolicySubject(roleId, tx);
      if (!role || !role.isActive || role.type !== UserType.BRANCH) {
        throw new BadRequestException(
          'Role không hợp lệ cho nhân viên chi nhánh',
        );
      }
      if (
        role.code === 'SUPER_ADMIN' ||
        role.code === 'BRANCH_ADMIN' ||
        role.code === 'CUSTOMER'
      ) {
        throw new ForbiddenException(
          'Không được gán role hệ thống qua Staff API',
        );
      }
      const targetMaxRoleLevel = targetBranch.roles.reduce(
        (maximum, assignment) => Math.max(maximum, assignment.role.level),
        0,
      );
      if (
        targetMaxRoleLevel >= actor.maxRoleLevel ||
        role.level >= actor.maxRoleLevel
      ) {
        throw new ForbiddenException(
          'Không được thao tác với role hoặc người dùng ngang hay cao cấp hơn',
        );
      }
      return this.repository.assignUserRole(
        targetBranch.id,
        roleId,
        actor.id,
        tx,
      );
    });
  }

  async removeUserRole(
    actor: AuthenticatedUser,
    context: BranchContext,
    userId: string,
    roleId: string,
  ) {
    try {
      const selectedBranchId =
        this.branchContextService.requireSelectedBranch(context);
      if (
        !actor.isSuperAdmin &&
        !actor.permissions.includes('staff.assign_role')
      ) {
        throw new ForbiddenException('Thiếu quyền gán role cho nhân viên');
      }
      // Await inside the local try/catch so the invariant error keeps its machine code.
      return await this.repository.transaction(async (tx) => {
        const targetBranch =
          await this.repository.findActiveUserBranchPolicySubject(
            userId,
            selectedBranchId,
            tx,
          );
        if (!targetBranch) {
          throw new NotFoundException('Người dùng không thuộc selected branch');
        }
        const role = await this.repository.findRolePolicySubject(roleId, tx);
        if (!role) throw new NotFoundException('Không tìm thấy role');
        if (
          role.type !== UserType.BRANCH ||
          role.code === 'SUPER_ADMIN' ||
          role.code === 'BRANCH_ADMIN' ||
          role.code === 'CUSTOMER'
        ) {
          throw new ForbiddenException(
            'Không được gỡ role hệ thống qua Staff API',
          );
        }
        const targetMaxRoleLevel = targetBranch.roles.reduce(
          (maximum, assignment) => Math.max(maximum, assignment.role.level),
          0,
        );
        if (
          targetMaxRoleLevel >= actor.maxRoleLevel ||
          role.level >= actor.maxRoleLevel
        ) {
          throw new ForbiddenException(
            'Không được thao tác với role hoặc người dùng ngang hay cao cấp hơn',
          );
        }
        return this.repository.removeUserRole(targetBranch.id, roleId, tx);
      });
    } catch (error) {
      if (error instanceof StaffLastRoleRequiredError) {
        throw new ConflictException({
          code: AUTHORIZATION_ERROR_CODES.staffLastRoleRequired,
          message: error.message,
        });
      }
      throw error;
    }
  }

  async upsertUserPermission(
    actor: AuthenticatedUser,
    context: BranchContext,
    userId: string,
    permissionId: string,
    effect: PermissionEffect,
  ) {
    const selectedBranchId =
      this.branchContextService.requireSelectedBranch(context);
    return this.repository.transaction(async (tx) => {
      const [targetBranch, permission] = await Promise.all([
        this.repository.findActiveUserBranchPolicySubject(
          userId,
          selectedBranchId,
          tx,
        ),
        this.repository.findPermissionPolicySubject(permissionId, tx),
      ]);
      if (!targetBranch || !permission) {
        throw new NotFoundException('Không tìm thấy user hoặc permission');
      }
      const targetMaxRoleLevel = targetBranch.roles.reduce(
        (maximum, assignment) => Math.max(maximum, assignment.role.level),
        0,
      );
      if (targetMaxRoleLevel >= actor.maxRoleLevel) {
        throw new ForbiddenException(
          'Không được cấp quyền cho người dùng ngang hoặc cao cấp hơn',
        );
      }
      if (DANGEROUS_PERMISSION_CODES.has(permission.code)) {
        throw new ForbiddenException(
          'Không được phép ủy quyền permission nguy hiểm',
        );
      }
      if (
        !actor.isSuperAdmin &&
        (!actor.permissions.includes('staff.assign_permission') ||
          !actor.permissions.includes(permission.code))
      ) {
        throw new ForbiddenException(
          'Không thể ủy quyền permission mà actor không sở hữu',
        );
      }
      return this.repository.upsertUserPermission(
        targetBranch.id,
        permissionId,
        effect,
        actor.id,
        tx,
      );
    });
  }

  async removeUserPermission(
    actor: AuthenticatedUser,
    context: BranchContext,
    userId: string,
    permissionId: string,
  ) {
    const selectedBranchId =
      this.branchContextService.requireSelectedBranch(context);
    return this.repository.transaction(async (tx) => {
      const [targetBranch, permission] = await Promise.all([
        this.repository.findActiveUserBranchPolicySubject(
          userId,
          selectedBranchId,
          tx,
        ),
        this.repository.findPermissionPolicySubject(permissionId, tx),
      ]);
      if (!targetBranch || !permission) {
        throw new NotFoundException('Không tìm thấy user hoặc permission');
      }
      const targetMaxRoleLevel = targetBranch.roles.reduce(
        (maximum, assignment) => Math.max(maximum, assignment.role.level),
        0,
      );
      if (targetMaxRoleLevel >= actor.maxRoleLevel) {
        throw new ForbiddenException(
          'Không được gỡ quyền của người dùng ngang hoặc cao cấp hơn',
        );
      }
      if (DANGEROUS_PERMISSION_CODES.has(permission.code)) {
        throw new ForbiddenException(
          'Không được phép ủy quyền permission nguy hiểm',
        );
      }
      if (
        !actor.isSuperAdmin &&
        (!actor.permissions.includes('staff.assign_permission') ||
          !actor.permissions.includes(permission.code))
      ) {
        throw new ForbiddenException(
          'Không thể gỡ permission mà actor không sở hữu',
        );
      }
      return this.repository.removeUserPermission(
        targetBranch.id,
        permissionId,
        tx,
      );
    });
  }

  async assignUserBranch(
    actor: AuthenticatedUser,
    userId: string,
    branchId: string,
    roleCode: 'STAFF' | 'BRANCH_ADMIN',
  ) {
    this.assertSuperAdmin(actor);
    await this.validateExplicitBranch(actor, branchId);
    return this.runValidatedWrite(() =>
      this.repository.assignUserBranch(userId, branchId, actor.id, roleCode),
    );
  }

  async transferStaffBranch(
    actor: AuthenticatedUser,
    userId: string,
    dto: TransferStaffBranchDto,
  ) {
    this.assertSuperAdmin(actor);
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException(
        'Branch nguồn và branch đích phải khác nhau',
      );
    }
    if (
      new Set(dto.destinationRoleIds).size !== dto.destinationRoleIds.length
    ) {
      throw new BadRequestException('Không được duplicate destinationRoleIds');
    }
    return this.runValidatedWrite(() =>
      this.repository.transferStaffBranch({
        userId,
        fromBranchId: dto.fromBranchId,
        toBranchId: dto.toBranchId,
        destinationRoleIds: dto.destinationRoleIds,
        assignedBy: actor.id,
      }),
    );
  }

  async setUserBranchActive(
    actor: AuthenticatedUser,
    userId: string,
    branchId: string,
    isActive: boolean,
    replacementBranchId?: string,
  ) {
    this.assertSuperAdmin(actor);
    if (isActive) await this.validateExplicitBranch(actor, branchId);
    const replacement = isActive
      ? undefined
      : await this.resolvePrimaryReplacement(
          actor,
          userId,
          branchId,
          replacementBranchId,
        );
    return this.runValidatedWrite(() =>
      this.repository.setUserBranchActive(
        userId,
        branchId,
        isActive,
        replacement,
      ),
    );
  }

  async removeUserBranch(
    actor: AuthenticatedUser,
    userId: string,
    branchId: string,
    replacementBranchId?: string,
  ) {
    this.assertSuperAdmin(actor);
    this.assertActorBranchScope(actor, branchId);
    const replacement = await this.resolvePrimaryReplacement(
      actor,
      userId,
      branchId,
      replacementBranchId,
    );
    return this.runValidatedWrite(() =>
      this.repository.removeUserBranch(userId, branchId, replacement),
    );
  }

  async setPrimaryUserBranch(
    actor: AuthenticatedUser,
    userId: string,
    branchId: string,
  ) {
    this.assertSuperAdmin(actor);
    await this.validateExplicitBranch(actor, branchId);
    return this.runValidatedWrite(() =>
      this.repository.setPrimaryUserBranch(userId, branchId, actor.id),
    );
  }

  private async listManagedUsers(
    kind: 'STAFF' | 'BRANCH_ADMIN',
    where: BranchWhere,
    query: CatalogQueryDto,
  ) {
    const { page, limit, skip } = getPaginationOptions(query);
    const [items, total] = await this.repository.listManagedUsers(
      kind,
      where,
      skip,
      limit,
      query.search,
    );
    return new PaginatedResponseDto(items, total, page, limit);
  }

  private async getManagedUser(
    id: string,
    kind: 'STAFF' | 'BRANCH_ADMIN',
    where: BranchWhere,
  ) {
    const user = await this.repository.findManagedUserInScope(id, kind, where);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  private assertPermissionCodeConsistency(
    code: string,
    resource: string,
    action: string,
  ): void {
    if (code !== `${resource}.${action}`) {
      throw new BadRequestException(
        'Permission code không khớp resource/action',
      );
    }
  }

  private toBranchResponse<
    T extends {
      latitude: Prisma.Decimal | null;
      longitude: Prisma.Decimal | null;
    },
  >(branch: T) {
    return {
      ...branch,
      latitude: branch.latitude?.toNumber() ?? null,
      longitude: branch.longitude?.toNumber() ?? null,
    };
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.isSuperAdmin) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Chỉ Super Admin được quản lý Branch Admin',
      );
    }
  }

  private async validateActiveBranches(ids: string[]): Promise<string[]> {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length)
      throw new BadRequestException('Cần ít nhất một chi nhánh');
    const branches = await this.repository.findActiveBranchesByIds(uniqueIds);
    if (branches.length !== uniqueIds.length) {
      throw new BadRequestException('Có chi nhánh không tồn tại hoặc inactive');
    }
    return uniqueIds;
  }

  private async validateExplicitBranch(
    actor: AuthenticatedUser,
    branchId: string,
  ): Promise<void> {
    const branch = await this.repository.findActiveBranchById(branchId);
    if (!branch) throw new NotFoundException('Không tìm thấy chi nhánh active');
    this.assertActorBranchScope(actor, branchId);
  }

  private assertActorBranchScope(actor: AuthenticatedUser, branchId: string) {
    const context: BranchContext = actor.isSuperAdmin
      ? { scope: 'ALL', selectedBranchId: null, allowedBranchIds: null }
      : actor.allowedBranchIds.length
        ? {
            scope: 'ALLOWED_SET',
            selectedBranchId: null,
            allowedBranchIds: actor.allowedBranchIds,
          }
        : { scope: 'NONE', selectedBranchId: null, allowedBranchIds: [] };
    this.branchContextService.assertBranchAccess(context, branchId);
  }

  private async resolvePrimaryReplacement(
    actor: AuthenticatedUser,
    userId: string,
    branchId: string,
    replacementBranchId?: string,
  ): Promise<string | undefined> {
    const assignments = await this.repository.listUserBranchAssignments(userId);
    const target = assignments.find((item) => item.branchId === branchId);
    if (!target)
      throw new NotFoundException('Không tìm thấy branch assignment');
    if (!target.isPrimary) return undefined;

    const remaining = assignments.filter(
      (item) =>
        item.branchId !== branchId && item.isActive && item.branch.isActive,
    );
    if (!remaining.length) return undefined;
    if (!replacementBranchId) {
      throw new BadRequestException(
        'Phải chọn primary branch thay thế khi gỡ primary hiện tại',
      );
    }
    const replacement = assignments.find(
      (item) =>
        item.branchId !== branchId &&
        item.branchId === replacementBranchId &&
        item.branch.isActive,
    );
    if (!replacement) {
      throw new BadRequestException('Primary branch thay thế không hợp lệ');
    }
    await this.validateExplicitBranch(actor, replacementBranchId);
    return replacementBranchId;
  }

  private async runValidatedWrite<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof AuthorizationWriteValidationError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof AuthorizationWriteScopeError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof AuthorizationWriteConflictError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
