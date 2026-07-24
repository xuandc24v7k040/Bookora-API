import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { VnpayModule } from '@/modules/integrations/vnpay/vnpay.module';
import { PaymentTransactionsController } from './payment-transactions.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule, VnpayModule],
  controllers: [PaymentsController, PaymentTransactionsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
