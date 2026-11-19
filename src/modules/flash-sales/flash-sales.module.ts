import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { StorefrontCatalogModule } from '@/modules/storefront-catalog/storefront-catalog.module';
import {
  FlashSalesController,
  PublicFlashSalesController,
} from './flash-sales.controller';
import { FlashSalesService } from './flash-sales.service';
import { FlashSaleOffersService } from './flash-sale-offers.service';

@Module({
  imports: [AuthModule, StorefrontCatalogModule],
  controllers: [FlashSalesController, PublicFlashSalesController],
  providers: [FlashSalesService, FlashSaleOffersService],
  exports: [FlashSaleOffersService],
})
export class FlashSalesModule {}
