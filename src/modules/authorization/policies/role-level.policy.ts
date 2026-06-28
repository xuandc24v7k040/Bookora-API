import { Injectable } from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import {
  AUTHORIZATION_ERROR_CODES,
  AUTHORIZATION_GUARD_NAME,
  BRANCH_ADMIN_ROLE_CODE,
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
export class RoleLevelPolicy {
  constructor(
    private readonly authorizationRepository: AuthorizationRepository,
  ) {}

  async assertCanAssignRole(
    actor: AuthenticatedUser,
    targetUserId: string,
    roleId: string,
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    if (
      !actor.isSuperAdmin &&
      !actor.permissions.includes('staff.assign_role')
    ) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Thiếu quyền gán role cho nhân viên',
      );
    }

    const [target, role] = await Promise.all([
      this.authorizationRepository.findUserPolicySubject(
        targetUserId,
        transaction,
      ),
      this.authorizationRepository.findRolePolicySubject(roleId, transaction),
    ]);

    if (!target) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.roleLevelViolation,
        'Không tìm thấy người dùng mục tiêu',
      );
    }
    if (!role || !role.isActive) {
      throw authorizationBadRequest(
        AUTHORIZATION_ERROR_CODES.roleInactive,
        'Role không tồn tại hoặc không hoạt động',
      );
    }
    if (role.guardName !== AUTHORIZATION_GUARD_NAME) {
      throw authorizationBadRequest(
        AUTHORIZATION_ERROR_CODES.roleTypeMismatch,
        'Role không tương thích với guard hiện tại',
      );
    }
    if (target.type !== role.type) {
      throw authorizationBadRequest(
        AUTHORIZATION_ERROR_CODES.roleTypeMismatch,
        'Loại tài khoản và role không tương thích',
      );
    }

    const targetMaxRoleLevel = target.userRoles.reduce(
      (maximum, assignment) => Math.max(maximum, assignment.role.level),
      0,
    );
    if (targetMaxRoleLevel >= actor.maxRoleLevel) {
      this.throwRoleLevelViolation();
    }

    if (role.code === SUPER_ADMIN_ROLE_CODE) {
      if (
        actor.isSuperAdmin &&
        actor.permissions.includes('super_admin.assign')
      ) {
        return;
      }
      this.throwRoleLevelViolation();
    }

    if (role.level >= actor.maxRoleLevel) {
      this.throwRoleLevelViolation();
    }

    if (
      role.code === BRANCH_ADMIN_ROLE_CODE &&
      !actor.permissions.includes('branch_admin.assign')
    ) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Thiếu quyền gán Branch Admin',
      );
    }

    if (!actor.isSuperAdmin) {
      this.assertBranchActorCanManageTarget(actor, target);
      if (
        role.type !== UserType.BRANCH ||
        role.code === BRANCH_ADMIN_ROLE_CODE
      ) {
        this.throwRoleLevelViolation();
      }
    }
  }

  async assertCanAssignRoleToNewBranchUser(
    actor: AuthenticatedUser,
    roleId: string,
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    if (
      !actor.isSuperAdmin &&
      !actor.permissions.includes('staff.assign_role')
    ) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Thiếu quyền gán role cho nhân viên',
      );
    }

    const role = await this.authorizationRepository.findRolePolicySubject(
      roleId,
      transaction,
    );
    if (!role || !role.isActive) {
      throw authorizationBadRequest(
        AUTHORIZATION_ERROR_CODES.roleInactive,
        'Role không tồn tại hoặc không hoạt động',
      );
    }
    if (
      role.guardName !== AUTHORIZATION_GUARD_NAME ||
      role.type !== UserType.BRANCH
    ) {
      throw authorizationBadRequest(
        AUTHORIZATION_ERROR_CODES.roleTypeMismatch,
        'Role không tương thích với nhân viên chi nhánh',
      );
    }
    if (role.level >= actor.maxRoleLevel) {
      this.throwRoleLevelViolation();
    }
    if (
      role.code === BRANCH_ADMIN_ROLE_CODE ||
      role.code === SUPER_ADMIN_ROLE_CODE
    ) {
      this.throwRoleLevelViolation();
    }
  }

  async assertCanManageExistingUser(
    actor: AuthenticatedUser,
    targetUserId: string,
    requiredPermission = 'staff.assign_role',
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    if (
      !actor.isSuperAdmin &&
      !actor.permissions.includes(requiredPermission)
    ) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Thiếu quyền quản lý role của nhân viên',
      );
    }

    const target = await this.authorizationRepository.findUserPolicySubject(
      targetUserId,
      transaction,
    );
    if (!target) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.roleLevelViolation,
        'Không tìm thấy người dùng mục tiêu',
      );
    }

    const targetMaxRoleLevel = target.userRoles.reduce(
      (maximum, assignment) => Math.max(maximum, assignment.role.level),
      0,
    );
    if (targetMaxRoleLevel >= actor.maxRoleLevel) {
      this.throwRoleLevelViolation();
    }

    if (!actor.isSuperAdmin) {
      this.assertBranchActorCanManageTarget(actor, target);
    }
  }

  async assertCanManageExistingBranchUser(
    actor: AuthenticatedUser,
    targetUserId: string,
    branchId: string,
    requiredPermission: string,
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    if (
      !actor.isSuperAdmin &&
      !actor.permissions.includes(requiredPermission)
    ) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Thiếu quyền quản lý nhân viên',
      );
    }

    const target =
      await this.authorizationRepository.findActiveUserBranchPolicySubject(
        targetUserId,
        branchId,
        transaction,
      );
    if (!target) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.branchAccessDenied,
        'Không tìm thấy nhân viên trong selected branch',
      );
    }

    const targetMaxRoleLevel = target.roles.reduce(
      (maximum, assignment) => Math.max(maximum, assignment.role.level),
      0,
    );
    if (targetMaxRoleLevel >= actor.maxRoleLevel) {
      this.throwRoleLevelViolation();
    }
  }

  private assertBranchActorCanManageTarget(
    actor: AuthenticatedUser,
    target: NonNullable<
      Awaited<ReturnType<AuthorizationRepository['findUserPolicySubject']>>
    >,
  ): void {
    if (actor.type !== UserType.BRANCH) {
      this.throwRoleLevelViolation();
    }

    const targetRoleCodes = new Set(
      target.userRoles.map(({ role }) => role.code),
    );
    if (
      targetRoleCodes.has(SUPER_ADMIN_ROLE_CODE) ||
      targetRoleCodes.has(BRANCH_ADMIN_ROLE_CODE)
    ) {
      this.throwRoleLevelViolation();
    }

    const allowedBranches = new Set(actor.allowedBranchIds);
    if (
      !target.userBranches.some(({ branchId }) => allowedBranches.has(branchId))
    ) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.branchAccessDenied,
        'Người dùng nằm ngoài phạm vi chi nhánh được phép',
      );
    }
  }

  private throwRoleLevelViolation(): never {
    throw authorizationForbidden(
      AUTHORIZATION_ERROR_CODES.roleLevelViolation,
      'Không được thao tác với role hoặc người dùng ngang hay cao cấp hơn',
    );
  }
}
