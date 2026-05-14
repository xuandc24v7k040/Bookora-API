import {
  HttpException,
  HttpStatus,
  type ValidationError,
} from '@nestjs/common';
import { Error as MongooseError } from 'mongoose';
import {
  type ExceptionResponse,
  type HttpExceptionResponseBody,
  type MongoServerException,
} from '../types';
import { flattenValidationErrors } from './validation.util';

export function createValidationExceptionResponse(
  validationErrors: ValidationError[],
): ExceptionResponse {
  return {
    statusCode: HttpStatus.BAD_REQUEST,
    message: 'Validation failed',
    error: 'Bad Request',
    errors: flattenValidationErrors(validationErrors),
  };
}

export function normalizeException(exception: unknown): ExceptionResponse {
  if (exception instanceof HttpException) {
    return normalizeHttpException(exception);
  }

  if (exception instanceof MongooseError.ValidationError) {
    return normalizeMongooseValidationError(exception);
  }

  if (exception instanceof MongooseError.CastError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      message: `Invalid ${exception.path}`,
      error: 'Bad Request',
      errors: {
        [exception.path]: exception.message,
      },
    };
  }

  if (isMongoDuplicateKeyError(exception)) {
    return {
      statusCode: HttpStatus.CONFLICT,
      message: 'Duplicate key error',
      error: 'Conflict',
      errors: getDuplicateKeyErrors(exception),
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
    error: 'Internal Server Error',
  };
}

function normalizeHttpException(exception: HttpException): ExceptionResponse {
  const statusCode = exception.getStatus();
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return {
      statusCode,
      message: response,
      error: exception.name,
    };
  }

  const body = response as HttpExceptionResponseBody;
  const message = Array.isArray(body.message)
    ? body.message.join(', ')
    : (body.message ?? exception.message);

  return {
    statusCode,
    message,
    error: body.error ?? exception.name,
    errors: body.errors,
  };
}

function normalizeMongooseValidationError(
  exception: MongooseError.ValidationError,
): ExceptionResponse {
  return {
    statusCode: HttpStatus.BAD_REQUEST,
    message: 'Database validation failed',
    error: 'Bad Request',
    errors: Object.fromEntries(
      Object.entries(exception.errors).map(([key, error]) => [
        key,
        error.message,
      ]),
    ),
  };
}

function isMongoDuplicateKeyError(
  exception: unknown,
): exception is MongoServerException {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    (exception as MongoServerException).code === 11000
  );
}

function getDuplicateKeyErrors(
  exception: MongoServerException,
): Record<string, string> {
  return Object.entries(exception.keyValue ?? {}).reduce<
    Record<string, string>
  >((errors, [key, value]) => {
    errors[key] = `${key} '${String(value)}' already exists`;
    return errors;
  }, {});
}
