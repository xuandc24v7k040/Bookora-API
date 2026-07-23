import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { StorefrontCatalogModule } from '@/modules/storefront-catalog/storefront-catalog.module';
import { CartController } from './cart.controller';
import { CartMapper } from './cart.mapper';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';
import { CartValidationService } from './cart-validation.service';

@Module({
  imports: [AuthModule, StorefrontCatalogModule],
  controllers: [CartController],
  providers: [CartRepository, CartService, CartMapper, CartValidationService],
})
export class CartModule {}
