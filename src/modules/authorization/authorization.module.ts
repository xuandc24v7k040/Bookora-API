import { Module } from '@nestjs/common';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { BranchContextService } from './branch-context.service';
import { BranchScopeGuard } from './guards/branch-scope.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PermissionDelegationPolicy } from './policies/permission-delegation.policy';
import { RoleLevelPolicy } from './policies/role-level.policy';
import { SystemProtectionPolicy } from './policies/system-protection.policy';
import { AuthorizationManagementService } from './authorization-management.service';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import {
  BranchAdminsController,
  BranchesController,
  PermissionsController,
  RolesController,
  StaffController,
} from './controllers/authorization-management.controllers';

const publicProviders = [
  AuthorizationService,
  BranchContextService,
  PermissionsGuard,
  BranchScopeGuard,
  RoleLevelPolicy,
  SystemProtectionPolicy,
  PermissionDelegationPolicy,
  AuthorizationManagementService,
];

@Module({
  controllers: [
    RolesController,
    PermissionsController,
    BranchesController,
    BranchAdminsController,
    StaffController,
  ],
  providers: [
    AuthorizationRepository,
    JwtAccessGuard,
    CsrfGuard,
    ...publicProviders,
  ],
  exports: publicProviders,
})
export class AuthorizationModule {}
