import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import {
  AUTH_ERROR_CODES,
  type GoogleOauthFailureCode,
} from '../auth-error-codes';
import { AuthService } from '../auth.service';

export interface GoogleOauthRequest extends Request {
  googleOauthFailure?: GoogleOauthFailureCode;
}

@Injectable()
export class GoogleOauthGuard extends AuthGuard('google') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<GoogleOauthRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const isCallback = request.path.endsWith('/google/callback');
    const queryError = request.query.error;

    if (isCallback && queryError) {
      request.googleOauthFailure =
        queryError === 'access_denied'
          ? AUTH_ERROR_CODES.googleAccessDenied
          : AUTH_ERROR_CODES.googleAuthFailed;
    }

    const state = isCallback
      ? (request.query.state as string | undefined)
      : this.authService.createOauthState(response);

    return {
      scope: ['email', 'profile'],
      state,
    };
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    const request = context.switchToHttp().getRequest<GoogleOauthRequest>();
    const isCallback = request.path.endsWith('/google/callback');

    if ((err || !user || request.googleOauthFailure) && isCallback) {
      request.googleOauthFailure ??= AUTH_ERROR_CODES.googleAuthFailed;
      return {} as TUser;
    }

    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }

    return user;
  }
}
