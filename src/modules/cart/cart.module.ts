import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { StorefrontCatalogModule } from '@/modules/storefront-catalog/storefront-catalog.module';
import { CartController } from './cart.controller';
import { CartFlashPriceService } from './cart-flash-price.service';
import { CartMapper } from './cart.mapper';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';
import { CartValidationService } from './cart-validation.service';

@Module({
  imports: [AuthModule, StorefrontCatalogModule],
  controllers: [CartController],
  providers: [
    CartFlashPriceService,
    CartRepository,
    CartService,
    CartMapper,
    CartValidationService,
  ],
  exports: [CartValidationService],
})
export class CartModule {}
