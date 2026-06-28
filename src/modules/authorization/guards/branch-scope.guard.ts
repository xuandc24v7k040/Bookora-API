import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHORIZATION_METADATA_KEYS } from '../authorization.constants';
import { BranchContextService } from '../branch-context.service';
import type { AuthorizationRequest } from '../types/authorization-request.type';
import { BranchScopeMode } from '../types/branch-context.type';

@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly branchContextService: BranchContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.reflector.getAllAndOverride<BranchScopeMode>(
      AUTHORIZATION_METADATA_KEYS.branchScope,
      [context.getHandler(), context.getClass()],
    );
    if (!mode) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthorizationRequest>();
    if (!request.user) {
      throw new UnauthorizedException();
    }

    await this.branchContextService.resolveBranchContext(request, mode);
    return true;
  }
}
