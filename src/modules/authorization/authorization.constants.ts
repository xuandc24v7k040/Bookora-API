export const AUTHORIZATION_METADATA_KEYS = {
  permissions: 'bookora:authorization:permissions',
  branchScope: 'bookora:authorization:branch-scope',
} as const;

export const AUTHORIZATION_ERROR_CODES = {
  permissionDenied: 'PERMISSION_DENIED',
  branchSelectionRequired: 'BRANCH_SELECTION_REQUIRED',
  branchAccessDenied: 'BRANCH_ACCESS_DENIED',
  branchNotFound: 'BRANCH_NOT_FOUND',
  roleLevelViolation: 'ROLE_LEVEL_VIOLATION',
  roleTypeMismatch: 'ROLE_TYPE_MISMATCH',
  roleInactive: 'ROLE_INACTIVE',
  systemRoleProtected: 'SYSTEM_ROLE_PROTECTED',
  dangerousPermissionDenied: 'DANGEROUS_PERMISSION_DENIED',
  lastSuperAdminProtected: 'LAST_SUPER_ADMIN_PROTECTED',
} as const;

export const AUTHORIZATION_GUARD_NAME = 'web';
export const SUPER_ADMIN_ROLE_CODE = 'SUPER_ADMIN';
export const BRANCH_ADMIN_ROLE_CODE = 'BRANCH_ADMIN';
export const BRANCH_ID_HEADER = 'x-branch-id';

export const DANGEROUS_PERMISSION_CODES = new Set<string>([
  'roles.create',
  'roles.update',
  'roles.delete',
  'roles.assign_permission',
  'permissions.create',
  'permissions.update',
  'permissions.delete',
  'branches.create',
  'branches.update',
  'branches.delete',
  'branches.assign',
  'staff.assign_branch',
  'super_admin.assign',
  'branch_admin.assign',
]);
