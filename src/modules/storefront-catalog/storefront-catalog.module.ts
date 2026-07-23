import { Module } from '@nestjs/common';
import { StorefrontCatalogController } from './storefront-catalog.controller';
import { StorefrontCatalogRepository } from './storefront-catalog.repository';
import { StorefrontCatalogService } from './storefront-catalog.service';
import { StorefrontPriceService } from './storefront-price.service';

@Module({
  controllers: [StorefrontCatalogController],
  providers: [
    StorefrontCatalogRepository,
    StorefrontCatalogService,
    StorefrontPriceService,
  ],
  exports: [StorefrontPriceService],
})
export class StorefrontCatalogModule {}
