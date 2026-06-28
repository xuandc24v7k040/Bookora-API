import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PermissionEffect, UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AuthorizationRepository } from './authorization.repository';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly authorizationRepository: AuthorizationRepository,
  ) {}

  async resolvePrincipal(
    sessionId: string,
    userId: string,
  ): Promise<AuthenticatedUser> {
    const source =
      await this.authorizationRepository.findActiveSessionPrincipalSource(
        sessionId,
        userId,
      );

    if (!source?.user.isActive) {
      throw new UnauthorizedException();
    }

    const globalAssignmentsAllowed =
      source.user.type === UserType.SYSTEM ||
      source.user.type === UserType.CUSTOMER;
    const activeRoles = Array.from(
      new Map(
        (globalAssignmentsAllowed ? source.user.userRoles : [])
          .map(({ role }) => role)
          .filter((role) => role.isActive)
          .map((role) => [role.id, role]),
      ).values(),
    ).sort(
      (left, right) =>
        right.level - left.level || left.code.localeCompare(right.code),
    );
    const isSuperAdmin = activeRoles.some(
      (role) => role.code === 'SUPER_ADMIN',
    );
    const rolePermissionCodes = new Set(
      activeRoles.flatMap((role) =>
        role.rolePermissions.map(({ permission }) => permission.code),
      ),
    );
    const allowedPermissionCodes = new Set<string>();
    const deniedPermissionCodes = new Set<string>();

    for (const userPermission of globalAssignmentsAllowed
      ? source.user.userPermissions
      : []) {
      const target =
        userPermission.effect === PermissionEffect.DENY
          ? deniedPermissionCodes
          : allowedPermissionCodes;
      target.add(userPermission.permission.code);
    }

    let permissions: string[];
    if (isSuperAdmin) {
      permissions = Array.from(
        new Set(await this.authorizationRepository.findAllPermissionCodes()),
      ).sort();
    } else {
      const effectivePermissions = new Set([
        ...rolePermissionCodes,
        ...allowedPermissionCodes,
      ]);
      for (const deniedPermission of deniedPermissionCodes) {
        effectivePermissions.delete(deniedPermission);
      }
      permissions = Array.from(effectivePermissions).sort();
    }

    const branchMap = new Map<
      string,
      { id: string; code: string; name: string; isPrimary: boolean }
    >();
    const branchAssignments: AuthenticatedUser['branchAssignments'] = [];

    if (isSuperAdmin) {
      for (const branch of await this.authorizationRepository.findAllActiveBranches()) {
        branchMap.set(branch.id, { ...branch, isPrimary: false });
      }
    } else if (source.user.type === UserType.BRANCH) {
      for (const assignment of source.user.userBranches) {
        if (!assignment.isActive || !assignment.branch.isActive) {
          continue;
        }

        const activeBranchRoles = Array.from(
          new Map(
            (assignment.roles ?? [])
              .map(({ role }) => role)
              .filter((role) => role.isActive)
              .map((role) => [role.id, role]),
          ).values(),
        ).sort(
          (left, right) =>
            right.level - left.level || left.code.localeCompare(right.code),
        );
        const branchRolePermissionCodes = new Set(
          activeBranchRoles.flatMap((role) =>
            role.rolePermissions.map(({ permission }) => permission.code),
          ),
        );
        const branchAllowedPermissionCodes = new Set<string>();
        const branchDeniedPermissionCodes = new Set<string>();
        for (const userPermission of assignment.permissions ?? []) {
          const target =
            userPermission.effect === PermissionEffect.DENY
              ? branchDeniedPermissionCodes
              : branchAllowedPermissionCodes;
          target.add(userPermission.permission.code);
        }
        const branchEffectivePermissions = new Set([
          ...branchRolePermissionCodes,
          ...branchAllowedPermissionCodes,
        ]);
        for (const deniedPermission of branchDeniedPermissionCodes) {
          branchEffectivePermissions.delete(deniedPermission);
        }
        const branch = {
          id: assignment.branch.id,
          code: assignment.branch.code,
          name: assignment.branch.name,
          isPrimary: assignment.isPrimary,
        };
        branchAssignments.push({
          branchId: assignment.branchId,
          userBranchId: assignment.id,
          branch,
          isPrimary: assignment.isPrimary,
          isActive: assignment.isActive,
          roles: activeBranchRoles.map((role) => ({
            id: role.id,
            code: role.code,
            level: role.level,
            type: role.type,
            isSystem: role.isSystem,
          })),
          permissions: Array.from(branchEffectivePermissions).sort(),
          maxRoleLevel: activeBranchRoles.reduce(
            (maximum, role) => Math.max(maximum, role.level),
            0,
          ),
        });

        const existing = branchMap.get(assignment.branch.id);
        branchMap.set(assignment.branch.id, {
          id: assignment.branch.id,
          code: assignment.branch.code,
          name: assignment.branch.name,
          isPrimary: (existing?.isPrimary ?? false) || assignment.isPrimary,
        });
      }
    }

    const branches = Array.from(branchMap.values());
    const primaryBranchId =
      branches.find(({ isPrimary }) => isPrimary)?.id ?? null;

    return {
      id: source.user.id,
      email: source.user.email,
      fullName: source.user.fullName ?? '',
      type: source.user.type,
      roles: activeRoles.map((role) => ({
        id: role.id,
        code: role.code,
        level: role.level,
        type: role.type,
        isSystem: role.isSystem,
      })),
      permissions,
      globalRoles: activeRoles.map((role) => ({
        id: role.id,
        code: role.code,
        level: role.level,
        type: role.type,
        isSystem: role.isSystem,
      })),
      globalPermissions: permissions,
      branchAssignments,
      allowedBranchIds: branches.map(({ id }) => id),
      branches,
      primaryBranchId,
      maxRoleLevel: activeRoles.reduce(
        (maximum, role) => Math.max(maximum, role.level),
        0,
      ),
      isSuperAdmin,
      sessionId: source.id,
    };
  }
}
