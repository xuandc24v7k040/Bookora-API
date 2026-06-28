import { Injectable } from '@nestjs/common';
import type { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import {
  AUTHORIZATION_ERROR_CODES,
  SUPER_ADMIN_ROLE_CODE,
} from '../authorization.constants';
import {
  authorizationForbidden,
  authorizationNotFound,
} from '../authorization.errors';
import { AuthorizationRepository } from '../authorization.repository';
import type { AuthorizationTransactionClient } from '../types/authorization-transaction.type';

export interface ProtectedRoleUpdate {
  code?: string;
  type?: UserType;
  isSystem?: boolean;
}

@Injectable()
export class SystemProtectionPolicy {
  constructor(
    private readonly authorizationRepository: AuthorizationRepository,
  ) {}

  assertCanCreateRole(actor: AuthenticatedUser): void {
    this.assertSuperAdminPermission(actor, 'roles.create');
  }

  assertCanCreatePermission(actor: AuthenticatedUser): void {
    this.assertSuperAdminPermission(actor, 'permissions.create');
  }

  assertCanUpdatePermission(actor: AuthenticatedUser): void {
    this.assertSuperAdminPermission(actor, 'permissions.update');
  }

  assertCanDeletePermission(actor: AuthenticatedUser): void {
    this.assertSuperAdminPermission(actor, 'permissions.delete');
  }

  async assertCanUpdateRole(
    actor: AuthenticatedUser,
    roleId: string,
    update: ProtectedRoleUpdate,
  ): Promise<void> {
    this.assertSuperAdminPermission(actor, 'roles.update');
    const role =
      await this.authorizationRepository.findRolePolicySubject(roleId);
    if (!role) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.systemRoleProtected,
        'Không tìm thấy role',
      );
    }

    if (
      role.isSystem &&
      ((update.code !== undefined && update.code !== role.code) ||
        (update.type !== undefined && update.type !== role.type) ||
        (update.isSystem !== undefined && update.isSystem !== role.isSystem))
    ) {
      this.throwSystemRoleProtected();
    }
  }

  async assertCanDeleteRole(
    actor: AuthenticatedUser,
    roleId: string,
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    this.assertSuperAdminPermission(actor, 'roles.delete');
    const role = await this.authorizationRepository.findRolePolicySubject(
      roleId,
      transaction,
    );
    if (!role) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.systemRoleProtected,
        'Không tìm thấy role',
      );
    }
    if (role.isSystem) {
      this.throwSystemRoleProtected();
    }
  }

  async assertCanRemoveSuperAdmin(
    userId: string,
    transaction?: AuthorizationTransactionClient,
  ): Promise<void> {
    const activeSuperAdmin =
      await this.authorizationRepository.isActiveSuperAdmin(
        userId,
        transaction,
      );
    if (!activeSuperAdmin) {
      return;
    }

    const count =
      await this.authorizationRepository.countActiveSuperAdmins(transaction);
    if (count <= 1) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.lastSuperAdminProtected,
        'Không thể vô hiệu hóa hoặc gỡ quyền Super Admin cuối cùng',
      );
    }
  }

  async assertCanDeactivateSuperAdminRole(
    roleId: string,
    transaction: AuthorizationTransactionClient,
  ): Promise<void> {
    const role = await transaction.role.findUnique({
      where: { id: roleId },
      select: { code: true, isActive: true },
    });
    if (!role || !role.isActive || role.code !== SUPER_ADMIN_ROLE_CODE) {
      return;
    }

    const count =
      await this.authorizationRepository.countActiveSuperAdmins(transaction);
    // Deactivating the shared SUPER_ADMIN role would invalidate every assignment.
    if (count > 0) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.lastSuperAdminProtected,
        'Không thể vô hiệu hóa role khi vẫn còn Super Admin đang hoạt động',
      );
    }
  }

  private assertSuperAdminPermission(
    actor: AuthenticatedUser,
    permission: string,
  ): void {
    if (!actor.isSuperAdmin || !actor.permissions.includes(permission)) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.permissionDenied,
        'Chỉ Super Admin có quyền phù hợp mới được quản lý authorization catalog',
      );
    }
  }

  private throwSystemRoleProtected(): never {
    throw authorizationForbidden(
      AUTHORIZATION_ERROR_CODES.systemRoleProtected,
      'Role hệ thống được bảo vệ',
    );
  }
}
