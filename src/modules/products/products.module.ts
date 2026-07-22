import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';
import { ProductMediaModule } from '@/modules/product-media/product-media.module';
import { AuthorizationModule } from '@/modules/authorization';

@Module({
  imports: [AuthorizationModule, ProductMediaModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository],
})
export class ProductsModule {}
