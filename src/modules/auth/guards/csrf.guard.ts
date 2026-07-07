import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeTokenEqual } from '@/common/utils';
import { AUTH_ERROR_CODES } from '../auth-error-codes';

const CSRF_INVALID_MESSAGE = 'CSRF token không hợp lệ';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    const cookieToken = request.cookies?.csrfToken as string | undefined;
    const headerToken = request.header('X-CSRF-Token');

    if (!timingSafeTokenEqual(cookieToken, headerToken)) {
      throw new ForbiddenException({
        message: CSRF_INVALID_MESSAGE,
        code: AUTH_ERROR_CODES.csrfInvalid,
      });
    }

    return true;
  }
}
