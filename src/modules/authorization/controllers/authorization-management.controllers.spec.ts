import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CsrfGuard } from '../../auth/guards/csrf.guard';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import { AUTHORIZATION_METADATA_KEYS, BranchScopeMode } from '../index';
import { BranchScopeGuard } from '../guards/branch-scope.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import {
  BranchAdminsController,
  RolesController,
  StaffController,
} from './authorization-management.controllers';

describe('Authorization management controller metadata', () => {
  it.each([RolesController, StaffController])(
    'uses authentication, CSRF, permission and branch guards in order',
    (controller) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        JwtAccessGuard,
        CsrfGuard,
        BranchScopeGuard,
        PermissionsGuard,
      ]);
    },
  );

  it('maps role permission endpoints explicitly', () => {
    expect(metadata(RolesController, 'list', 'permissions')).toEqual([
      'roles.read',
    ]);
    expect(metadata(RolesController, 'create', 'permissions')).toEqual([
      'roles.create',
    ]);
    expect(
      metadata(RolesController, 'assignPermission', 'permissions'),
    ).toEqual(['roles.assign_permission']);
  });

  it('requires a selected branch for every staff-scoped read and mutation', () => {
    expect(metadata(StaffController, 'list', 'branchScope')).toBe(
      BranchScopeMode.REQUIRED_SELECTION,
    );
    expect(metadata(StaffController, 'get', 'branchScope')).toBe(
      BranchScopeMode.REQUIRED_SELECTION,
    );
    expect(metadata(StaffController, 'update', 'branchScope')).toBe(
      BranchScopeMode.REQUIRED_SELECTION,
    );
    expect(metadata(StaffController, 'create', 'branchScope')).toBe(
      BranchScopeMode.REQUIRED_SELECTION,
    );
  });

  it('exposes staff transfer as a Super-Admin service flow behind staff branch permission', () => {
    expect(metadata(StaffController, 'transferBranch', 'permissions')).toEqual([
      'staff.assign_branch',
    ]);
    expect(metadata(StaffController, 'transferBranch', 'branchScope')).toBe(
      undefined,
    );
  });

  it('exposes global Staff assignment history without selected branch scope', () => {
    expect(metadata(StaffController, 'assignments', 'permissions')).toEqual([
      'staff.read',
    ]);
    expect(metadata(StaffController, 'assignments', 'branchScope')).toBe(
      undefined,
    );
  });

  it('exposes Branch Admin activate and deactivate assignment permissions', () => {
    expect(
      metadata(BranchAdminsController, 'activateBranch', 'permissions'),
    ).toEqual(['branch_admin.assign', 'branches.assign']);
    expect(
      metadata(BranchAdminsController, 'deactivateBranch', 'permissions'),
    ).toEqual(['branch_admin.assign', 'branches.assign']);
  });
});

function metadata(
  controller:
    | typeof RolesController
    | typeof StaffController
    | typeof BranchAdminsController,
  method: string,
  key: keyof typeof AUTHORIZATION_METADATA_KEYS,
) {
  const handler =
    controller.prototype[method as keyof InstanceType<typeof controller>];
  return Reflect.getMetadata(AUTHORIZATION_METADATA_KEYS[key], handler);
}
