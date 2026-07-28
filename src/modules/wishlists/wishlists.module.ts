import { Module } from '@nestjs/common';
import { StorefrontCatalogModule } from '@/modules/storefront-catalog/storefront-catalog.module';
import { WishlistsController } from './wishlists.controller';
import { WishlistsRepository } from './wishlists.repository';
import { WishlistsService } from './wishlists.service';

@Module({
  imports: [StorefrontCatalogModule],
  controllers: [WishlistsController],
  providers: [WishlistsRepository, WishlistsService],
  exports: [WishlistsService],
})
export class WishlistsModule {}
