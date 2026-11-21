import { Module } from '@nestjs/common';
import { RealtimeModule } from '@/modules/realtime/realtime.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { OrderRealtimeService } from './order-realtime.service';

@Module({
  imports: [RealtimeModule, NotificationsModule],
  providers: [OrderRealtimeService],
})
export class OrderRealtimeModule {}
