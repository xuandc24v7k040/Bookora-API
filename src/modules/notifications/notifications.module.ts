import { Module } from '@nestjs/common';
import { RealtimeModule } from '@/modules/realtime/realtime.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationWorker } from './notification-worker.service';
import { PromotionWakeService } from './promotion-wake.service';

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationWorker, PromotionWakeService],
  exports: [NotificationWorker],
})
export class NotificationsModule {}
