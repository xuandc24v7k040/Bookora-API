import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHORIZATION_ERROR_CODES } from '../authorization.constants';
import { SUPER_ADMIN_ONLY_METADATA_KEY } from '../decorators/super-admin-only.decorator';
import { authorizationForbidden } from '../authorization.errors';
import type { AuthorizationRequest } from '../types/authorization-request.type';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresSuperAdmin = this.reflector.getAllAndOverride<boolean>(
      SUPER_ADMIN_ONLY_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresSuperAdmin) return true;

    const request = context.switchToHttp().getRequest<AuthorizationRequest>();
    if (!request.user) throw new UnauthorizedException();
    if (request.user.isSuperAdmin) return true;

    throw authorizationForbidden(
      AUTHORIZATION_ERROR_CODES.permissionDenied,
      'Chỉ Super Admin được thực hiện thao tác này',
    );
  }
}
