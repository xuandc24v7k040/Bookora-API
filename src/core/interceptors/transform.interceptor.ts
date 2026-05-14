import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response as ExpressResponse } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '../../common/decorators';
import type { ApiResponse, ApiResponsePayload } from '../../common/types';

function isResponseWithMeta<T>(
  value: unknown,
): value is Required<Pick<ApiResponsePayload<T>, 'data' | 'meta'>> &
  Pick<ApiResponsePayload<T>, 'message'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'meta' in value &&
    'data' in value
  );
}

function isResponseWithResult<T>(
  value: unknown,
): value is ApiResponsePayload<T> {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const response = context.switchToHttp().getResponse<ExpressResponse>();
    const { statusCode } = response;
    const responseMessage = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((data: unknown): ApiResponse<T> => {
        if (isResponseWithMeta<T>(data)) {
          return {
            statusCode,
            message: data.message ?? responseMessage ?? 'Success',
            data: data.data,
            meta: data.meta,
          };
        }

        if (isResponseWithResult<T>(data)) {
          return {
            statusCode,
            message: data.message ?? responseMessage ?? 'Success',
            data: data.result ?? (data as T),
          };
        }

        return {
          statusCode,
          message: responseMessage ?? 'Success',
          data: data as T,
        };
      }),
    );
  }
}
