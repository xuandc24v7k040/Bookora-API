import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthorizationModule } from '@/modules/authorization/authorization.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisher } from './realtime-publisher';
import { RealtimeInboundRegistry } from './realtime-inbound.registry';

@Module({
  imports: [JwtModule.register({}), AuthorizationModule],
  providers: [
    RealtimeInboundRegistry,
    RealtimeGateway,
    { provide: RealtimePublisher, useExisting: RealtimeGateway },
  ],
  exports: [RealtimePublisher, RealtimeInboundRegistry],
})
export class RealtimeModule {}
