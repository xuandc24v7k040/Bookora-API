import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { VietMapModule } from '@/modules/integrations/vietmap/vietmap.module';
import { VnpayModule } from '@/modules/integrations/vnpay/vnpay.module';
import { InternalShippingFeeService } from '@/modules/shipping/internal-shipping-fee.service';
import { StorefrontCatalogModule } from '@/modules/storefront-catalog/storefront-catalog.module';
import { CartModule } from '@/modules/cart/cart.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutRepository } from './checkout.repository';
import { CheckoutService } from './checkout.service';

@Module({
  imports: [
    AuthModule,
    CartModule,
    StorefrontCatalogModule,
    VietMapModule,
    VnpayModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutRepository, InternalShippingFeeService, CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
