import { Injectable } from '@nestjs/common';
import { PermissionEffect, UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import {
  AUTHORIZATION_ERROR_CODES,
  DANGEROUS_PERMISSION_CODES,
  STAFF_DELEGATABLE_PERMISSION_CODES,
  SUPER_ADMIN_ROLE_CODE,
} from '../authorization.constants';
import {
  authorizationBadRequest,
  authorizationForbidden,
  authorizationNotFound,
} from '../authorization.errors';
import { AuthorizationRepository } from '../authorization.repository';
import type { AuthorizationTransactionClient } from '../types/authorization-transaction.type';

@Injectable()
export class PermissionDelegationPolicy {
  constructor(
    private readonly authorizationRepository: AuthorizationRepository,
  ) {}

  async assertCanAssignUserPermission(
    actor: AuthenticatedUser,
    targetUserId: string,
    permissionId: string,
    effect: PermissionEffect,
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    void effect;
    const [target, permission] = await Promise.all([
      this.authorizationRepository.findUserPolicySubject(
        targetUserId,
        transaction,
      ),
      this.authorizationRepository.findPermissionPolicySubject(
        permissionId,
        transaction,
      ),
    ]);
    if (!target || !permission) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Không tìm thấy user hoặc permission',
      );
    }

    const targetIsSuperAdmin = target.userRoles.some(
      ({ role }) => role.code === SUPER_ADMIN_ROLE_CODE,
    );
    if (targetIsSuperAdmin) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.systemRoleProtected,
        'Không được tạo permission override cho Super Admin đang hoạt động',
      );
    }

    const targetMaxRoleLevel = target.userRoles.reduce(
      (maximum, assignment) => Math.max(maximum, assignment.role.level),
      0,
    );
    if (targetMaxRoleLevel >= actor.maxRoleLevel) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.roleLevelViolation,
        'Không được cấp quyền cho người dùng ngang hoặc cao cấp hơn',
      );
    }

    if (!actor.isSuperAdmin) {
      if (!actor.permissions.includes('staff.assign_permission')) {
        throw authorizationForbidden(
          AUTHORIZATION_ERROR_CODES.permissionDenied,
          'Thiếu quyền gán permission cho nhân viên',
        );
      }
      this.assertTargetBranchIntersection(actor, target.userBranches);
      if (!actor.permissions.includes(permission.code)) {
        throw authorizationForbidden(
          AUTHORIZATION_ERROR_CODES.permissionDenied,
          'Không thể ủy quyền permission mà actor không sở hữu',
        );
      }
    }

    if (DANGEROUS_PERMISSION_CODES.has(permission.code)) {
      this.throwDangerousPermissionDenied();
    }
    this.assertStaffPermissionCodeIsDelegatable(permission.code);
  }

  async assertCanAssignRolePermission(
    actor: AuthenticatedUser,
    roleId: string,
    permissionId: string,
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    const [role, permission] = await Promise.all([
      this.authorizationRepository.findRolePolicySubject(roleId, transaction),
      this.authorizationRepository.findPermissionPolicySubject(
        permissionId,
        transaction,
      ),
    ]);
    if (!role || !permission) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Không tìm thấy role hoặc permission',
      );
    }
    if (role.isSystem) {
      this.throwSystemRoleProtected();
    }
    if (!role.isActive) {
      throw authorizationBadRequest(
        AUTHORIZATION_ERROR_CODES.roleInactive,
        'Không thể gán permission cho role không hoạt động',
      );
    }
    if (role.guardName !== permission.guardName) {
      throw authorizationBadRequest(
        AUTHORIZATION_ERROR_CODES.roleTypeMismatch,
        'Role và permission không cùng guard',
      );
    }

    const dangerous = DANGEROUS_PERMISSION_CODES.has(permission.code);
    if (dangerous && role.type !== UserType.SYSTEM) {
      this.throwDangerousPermissionDenied();
    }
    if (
      dangerous &&
      (!actor.isSuperAdmin || !actor.permissions.includes(permission.code))
    ) {
      this.throwDangerousPermissionDenied();
    }

    if (DANGEROUS_PERMISSION_CODES.has(permission.code)) {
      this.throwDangerousPermissionDenied();
    }
    if (!actor.isSuperAdmin) {
      if (
        !actor.permissions.includes('roles.assign_permission') ||
        !actor.permissions.includes(permission.code) ||
        role.level >= actor.maxRoleLevel
      ) {
        throw authorizationForbidden(
          AUTHORIZATION_ERROR_CODES.permissionDenied,
          'Không được phép thay đổi permission mapping này',
        );
      }
    }
  }

  async assertCanAssignInitialPermission(
    actor: AuthenticatedUser,
    permissionId: string,
    effect: PermissionEffect,
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    void effect;
    const permission =
      await this.authorizationRepository.findPermissionPolicySubject(
        permissionId,
        transaction,
      );
    if (permission && DANGEROUS_PERMISSION_CODES.has(permission.code)) {
      this.throwDangerousPermissionDenied();
    }
    if (!permission) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Không tìm thấy permission',
      );
    }
    this.assertStaffPermissionCodeIsDelegatable(permission.code);
    if (!actor.isSuperAdmin) {
      if (
        !actor.permissions.includes('staff.assign_permission') ||
        !actor.permissions.includes(permission.code)
      ) {
        throw authorizationForbidden(
          AUTHORIZATION_ERROR_CODES.permissionDenied,
          'Không được phép ủy quyền permission này',
        );
      }
    }
  }

  async assertCanRemoveRolePermission(
    actor: AuthenticatedUser,
    roleId: string,
    permissionId: string,
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    const [role, permission] = await Promise.all([
      this.authorizationRepository.findRolePolicySubject(roleId, transaction),
      this.authorizationRepository.findPermissionPolicySubject(
        permissionId,
        transaction,
      ),
    ]);
    if (!role || !permission) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Không tìm thấy role hoặc permission',
      );
    }
    if (role.isSystem) {
      this.throwSystemRoleProtected();
    }
    if (role.guardName !== permission.guardName) {
      throw authorizationBadRequest(
        AUTHORIZATION_ERROR_CODES.roleTypeMismatch,
        'Role và permission không cùng guard',
      );
    }
    if (DANGEROUS_PERMISSION_CODES.has(permission.code)) {
      if (!actor.isSuperAdmin || !actor.permissions.includes(permission.code)) {
        this.throwDangerousPermissionDenied();
      }
      return;
    }
    if (
      !actor.isSuperAdmin &&
      (!actor.permissions.includes('roles.assign_permission') ||
        !actor.permissions.includes(permission.code) ||
        role.level >= actor.maxRoleLevel)
    ) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Không được phép thay đổi permission mapping này',
      );
    }
  }

  private assertTargetBranchIntersection(
    actor: AuthenticatedUser,
    targetBranches: Array<{ branchId: string }>,
  ): void {
    const actorBranchIds = new Set(actor.allowedBranchIds);
    if (!targetBranches.some(({ branchId }) => actorBranchIds.has(branchId))) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.branchAccessDenied,
        'Người dùng nằm ngoài phạm vi chi nhánh được phép',
      );
    }
  }

  private throwDangerousPermissionDenied(): never {
    throw authorizationForbidden(
      AUTHORIZATION_ERROR_CODES.dangerousPermissionDenied,
      'Không được phép ủy quyền permission nguy hiểm',
    );
  }

  assertStaffPermissionCodeIsDelegatable(code: string): void {
    if (
      !(STAFF_DELEGATABLE_PERMISSION_CODES as readonly string[]).includes(code)
    ) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Quyền quản trị catalog hoặc hệ thống không thể cấp trực tiếp cho nhân viên',
      );
    }
  }

  private throwSystemRoleProtected(): never {
    throw authorizationForbidden(
      AUTHORIZATION_ERROR_CODES.systemRoleProtected,
      'Role hệ thống được bảo vệ và không thể thay đổi permission',
    );
  }
}
