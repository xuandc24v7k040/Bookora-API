import { normalizeException, removeUndefinedProperties } from '@/common/utils';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { type Request, type Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const normalized = normalizeException(exception);

    if (normalized.statusCode >= 500) {
      this.logger.error(
        normalized.message,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(normalized.statusCode).json(
      removeUndefinedProperties({
        statusCode: normalized.statusCode,
        message: normalized.message,
        error: normalized.error,
        errors: normalized.errors,
        path: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
