import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SUPPORT_MAX_FILE_SIZE } from './support.policy';

@Injectable()
export class SupportUploadInterceptor extends FileInterceptor('file', {
  // Busboy raises LIMIT_FILE_SIZE at >= limit. Permit the exact 10 MiB boundary,
  // then validate actual bytes before any storage write.
  limits: {
    fileSize: SUPPORT_MAX_FILE_SIZE + 1,
    files: 1,
    fields: 4,
    parts: 5,
    fieldSize: 100,
  },
}) {
  override async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException)
        throw new PayloadTooLargeException({
          code: 'SUPPORT_ATTACHMENT_TOO_LARGE',
          message: 'Mỗi tệp tối đa 10 MiB.',
        });
      if (error instanceof BadRequestException)
        throw new BadRequestException({
          code: 'SUPPORT_ATTACHMENT_INVALID',
          message: 'Tệp tải lên không hợp lệ. Chỉ tải một tệp cho mỗi yêu cầu.',
        });
      throw error;
    }
  }
}
