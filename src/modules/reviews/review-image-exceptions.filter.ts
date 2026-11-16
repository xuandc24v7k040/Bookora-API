import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AllExceptionsFilter } from '@/core/filters/all-exceptions.filter';

/** Translate Multer transport errors while reusing the shared response envelope. */
@Catch(PayloadTooLargeException, BadRequestException)
export class ReviewImageExceptionsFilter extends AllExceptionsFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    if (exception instanceof PayloadTooLargeException) {
      return super.catch(
        new PayloadTooLargeException({
          code: 'REVIEW_IMAGE_TOO_LARGE',
          message: 'Ảnh không được vượt quá 5 MB.',
        }),
        host,
      );
    }
    if (['Too many files', 'Unexpected field'].includes(exception.message)) {
      return super.catch(
        new BadRequestException({
          code: 'REVIEW_IMAGE_LIMIT_EXCEEDED',
          message: 'Vui lòng chọn tối đa 4 ảnh với trường files.',
        }),
        host,
      );
    }
    return super.catch(exception, host);
  }
}
