import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AUTHORIZATION_ERROR_CODES,
  AUTHORIZATION_METADATA_KEYS,
} from '../authorization.constants';
import { authorizationForbidden } from '../authorization.errors';
import type { AuthorizationRequest } from '../types/authorization-request.type';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthorizationRequest>();
    if (!request.user) {
      throw new UnauthorizedException();
    }

    const requiredPermissions = new Set(
      this.reflector.getAllAndMerge<string[]>(
        AUTHORIZATION_METADATA_KEYS.permissions,
        [context.getClass(), context.getHandler()],
      ) ?? [],
    );

    if (requiredPermissions.size === 0 || request.user.isSuperAdmin) {
      return true;
    }

    const actorPermissions = new Set(request.user.permissions);
    if (
      Array.from(requiredPermissions).every((permission) =>
        actorPermissions.has(permission),
      )
    ) {
      return true;
    }

    throw authorizationForbidden(
      AUTHORIZATION_ERROR_CODES.permissionDenied,
      'Bạn không có quyền thực hiện thao tác này',
    );
  }
}
