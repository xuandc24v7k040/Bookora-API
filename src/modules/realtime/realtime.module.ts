import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisher } from './realtime-publisher';

@Module({
  imports: [JwtModule.register({}), AuthorizationModule],
  providers: [
    RealtimeGateway,
    { provide: RealtimePublisher, useExisting: RealtimeGateway },
  ],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
