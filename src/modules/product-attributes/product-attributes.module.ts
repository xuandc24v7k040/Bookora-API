import { Module } from '@nestjs/common';
import { ProductAttributesController } from './product-attributes.controller';
import { ProductAttributesRepository } from './product-attributes.repository';
import { ProductAttributesService } from './product-attributes.service';
@Module({
  controllers: [ProductAttributesController],
  providers: [ProductAttributesService, ProductAttributesRepository],
})
export class ProductAttributesModule {}
