import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { CouponsRepository } from './coupons.repository';
import { CouponsExpiryService } from './coupons-expiry.service';

@Module({
  imports: [AuthModule],
  controllers: [CouponsController],
  providers: [CouponsRepository, CouponsService, CouponsExpiryService],
  exports: [CouponsService],
})
export class CouponsModule {}
