import { Module } from '@nestjs/common';
import { AuthorizationModule } from '@/modules/authorization';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersRepository } from './admin-orders.repository';
import { AdminOrdersService } from './admin-orders.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService, AdminOrdersRepository],
})
export class AdminOrdersModule {}
