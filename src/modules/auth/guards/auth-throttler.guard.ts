import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
} from '@nestjs/throttler';
import environmentConfig from '../../../config/environment.config';

const environment = environmentConfig();

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    if (environment.nodeEnv !== 'production') {
      const request = context.switchToHttp().getRequest<{ url: string }>();
      throw new ThrottlerException(
        `Bạn thao tác quá nhanh tại ${request.url}. Giới hạn ${detail.limit} lần trong ${Math.round(detail.ttl / 1000)} giây, thử lại sau ${detail.timeToBlockExpire} giây.`,
      );
    }

    await super.throwThrottlingException(context, detail);
  }
}
