export {
  AUTHORIZATION_ERROR_CODES,
  AUTHORIZATION_METADATA_KEYS,
  BRANCH_ID_HEADER,
  DANGEROUS_PERMISSION_CODES,
} from './authorization.constants';
export { AuthorizationModule } from './authorization.module';
export { AuthorizationService } from './authorization.service';
export { AuthorizationManagementService } from './authorization-management.service';
export { BranchContextService } from './branch-context.service';
export { BranchScope } from './decorators/branch-scope.decorator';
export { AnyPermissions } from './decorators/any-permissions.decorator';
export { CurrentBranchContext } from './decorators/current-branch-context.decorator';
export { Permissions } from './decorators/permissions.decorator';
export { BranchScopeGuard } from './guards/branch-scope.guard';
export { PermissionsGuard } from './guards/permissions.guard';
export { PermissionDelegationPolicy } from './policies/permission-delegation.policy';
export { RoleLevelPolicy } from './policies/role-level.policy';
export {
  SystemProtectionPolicy,
  type ProtectedRoleUpdate,
} from './policies/system-protection.policy';
export type { AuthorizationRequest } from './types/authorization-request.type';
export type { AuthorizationTransactionClient } from './types/authorization-transaction.type';
export {
  BranchScopeMode,
  type BranchContext,
  type BranchWhere,
} from './types/branch-context.type';
