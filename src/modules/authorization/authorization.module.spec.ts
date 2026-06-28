import { Test } from '@nestjs/testing';
import { AuthorizationModule } from './authorization.module';
import { AuthorizationRepository } from './authorization.repository';
import { BranchContextService } from './branch-context.service';
import { BranchScopeGuard } from './guards/branch-scope.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PermissionDelegationPolicy } from './policies/permission-delegation.policy';
import { RoleLevelPolicy } from './policies/role-level.policy';
import { SystemProtectionPolicy } from './policies/system-protection.policy';
import { AuthorizationManagementService } from './authorization-management.service';

describe('AuthorizationModule', () => {
  it('exports the authorization core providers needed by feature modules', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthorizationModule],
    })
      .overrideProvider(AuthorizationRepository)
      .useValue({})
      .compile();

    expect(moduleRef.get(PermissionsGuard)).toBeInstanceOf(PermissionsGuard);
    expect(moduleRef.get(BranchScopeGuard)).toBeInstanceOf(BranchScopeGuard);
    expect(moduleRef.get(BranchContextService)).toBeInstanceOf(
      BranchContextService,
    );
    expect(moduleRef.get(RoleLevelPolicy)).toBeInstanceOf(RoleLevelPolicy);
    expect(moduleRef.get(SystemProtectionPolicy)).toBeInstanceOf(
      SystemProtectionPolicy,
    );
    expect(moduleRef.get(PermissionDelegationPolicy)).toBeInstanceOf(
      PermissionDelegationPolicy,
    );
    expect(moduleRef.get(AuthorizationManagementService)).toBeInstanceOf(
      AuthorizationManagementService,
    );
  });
});
