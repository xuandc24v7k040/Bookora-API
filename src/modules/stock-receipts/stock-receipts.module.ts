import { Module } from '@nestjs/common';
import { AuthorizationModule } from '@/modules/authorization';
import { StockReceiptsController } from './stock-receipts.controller';
import { StockReceiptsRepository } from './stock-receipts.repository';
import { StockReceiptsService } from './stock-receipts.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [StockReceiptsController],
  providers: [StockReceiptsService, StockReceiptsRepository],
})
export class StockReceiptsModule {}
