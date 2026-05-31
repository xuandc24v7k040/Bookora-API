import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    if (
      this.configService.get<string>('environment.nodeEnv') !== 'production'
    ) {
      const request = context.switchToHttp().getRequest<{ url: string }>();
      throw new ThrottlerException(
        `Bạn thao tác quá nhanh tại ${request.url}. Giới hạn ${detail.limit} lần trong ${Math.round(detail.ttl / 1000)} giây, thử lại sau ${detail.timeToBlockExpire} giây.`,
      );
    }

    await super.throwThrottlingException(context, detail);
  }
}
