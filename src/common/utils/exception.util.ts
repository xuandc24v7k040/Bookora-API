import {
  HttpException,
  HttpStatus,
  type ValidationError,
} from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import {
  type ExceptionResponse,
  type HttpExceptionResponseBody,
} from '../types';
import { flattenValidationErrors } from './validation.util';

export function createValidationExceptionResponse(
  validationErrors: ValidationError[],
): ExceptionResponse {
  return {
    statusCode: HttpStatus.BAD_REQUEST,
    message: 'Dữ liệu không hợp lệ',
    error: 'Yêu cầu không hợp lệ',
    errors: flattenValidationErrors(validationErrors),
  };
}

export function normalizeException(exception: unknown): ExceptionResponse {
  if (exception instanceof HttpException) {
    return normalizeHttpException(exception);
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return normalizePrismaKnownRequestError(exception);
  }

  if (exception instanceof Prisma.PrismaClientValidationError) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Dữ liệu không hợp lệ',
      error: 'Yêu cầu không hợp lệ',
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Lỗi máy chủ nội bộ',
    error: 'Lỗi máy chủ nội bộ',
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
    code: body.code,
    errors: body.errors,
  };
}

function normalizePrismaKnownRequestError(
  exception: Prisma.PrismaClientKnownRequestError,
): ExceptionResponse {
  if (exception.code === 'P2002') {
    return {
      statusCode: HttpStatus.CONFLICT,
      message: 'Dữ liệu đã tồn tại',
      error: 'Xung đột dữ liệu',
    };
  }

  if (exception.code === 'P2003') {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Dữ liệu liên kết không hợp lệ',
      error: 'Yêu cầu không hợp lệ',
    };
  }

  if (exception.code === 'P2025') {
    return {
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Không tìm thấy dữ liệu',
      error: 'Không tìm thấy',
    };
  }

  return {
    statusCode: HttpStatus.BAD_REQUEST,
    message: 'Thao tác cơ sở dữ liệu không hợp lệ',
    error: 'Yêu cầu không hợp lệ',
  };
}
