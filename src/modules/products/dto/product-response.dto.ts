import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductAttributeType, ProductStatus } from '@/generated/prisma/client';

export class ProductRelationSummaryDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
}

export class ProductDefaultVariantSummaryDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sku!: string;
  @ApiProperty({ type: String, example: '45000' }) originalPrice!: string;
  @ApiPropertyOptional({ type: String, nullable: true, example: '40500' })
  salePrice!: string | null;
  @ApiProperty() isActive!: boolean;
}

export class ProductListItemResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: ProductStatus }) status!: ProductStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  releaseDate!: string | null;
  @ApiPropertyOptional({ type: ProductRelationSummaryDto, nullable: true })
  supplier!: ProductRelationSummaryDto | null;
  @ApiPropertyOptional({ type: ProductRelationSummaryDto, nullable: true })
  publisher!: ProductRelationSummaryDto | null;
  @ApiProperty({ type: [ProductRelationSummaryDto] })
  categories!: ProductRelationSummaryDto[];
  @ApiProperty({ type: [ProductRelationSummaryDto] })
  authors!: ProductRelationSummaryDto[];
  @ApiPropertyOptional({
    type: ProductDefaultVariantSummaryDto,
    nullable: true,
  })
  defaultVariant!: ProductDefaultVariantSummaryDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) minPrice!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) maxPrice!:
    | string
    | null;
  @ApiProperty() variantCount!: number;
  @ApiProperty() activeVariantCount!: number;
  @ApiProperty() optionCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class ProductAttributeValueResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ format: 'ulid' }) attributeId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: ProductAttributeType }) type!: ProductAttributeType;
  @ApiProperty({
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  value!: unknown;
}

export class ProductDetailResponseDto extends ProductListItemResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true }) shortDescription!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!:
    | string
    | null;
  @ApiProperty({ type: [ProductAttributeValueResponseDto] })
  attributeValues!: ProductAttributeValueResponseDto[];
  @ApiProperty({ enum: ['SIMPLE', 'OPTIONED', 'UNCONFIGURED'] })
  configuration!: 'SIMPLE' | 'OPTIONED' | 'UNCONFIGURED';
}

export class ProductOptionValueResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() value!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) colorCode!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uri' })
  imageUrl!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ minimum: 0 }) usageCount!: number;
}

export class ProductOptionResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: [ProductOptionValueResponseDto] })
  values!: ProductOptionValueResponseDto[];
  @ApiProperty() variantUsageCount!: number;
}

export class ProductVariantOptionSelectionResponseDto {
  @ApiProperty({ format: 'ulid' }) optionId!: string;
  @ApiProperty() optionName!: string;
  @ApiProperty() optionCode!: string;
  @ApiProperty({ format: 'ulid' }) optionValueId!: string;
  @ApiProperty() label!: string;
  @ApiProperty() value!: string;
}

export class ProductVariantResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sku!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) barcode!:
    | string
    | null;
  @ApiProperty() combinationKey!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) isbn!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) publicationYear!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) pageCount!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) weightGram!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) packageSize!:
    | string
    | null;
  @ApiProperty({ type: String }) originalPrice!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) salePrice!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  saleStartAt!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  saleEndAt!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [ProductVariantOptionSelectionResponseDto] })
  optionValues!: ProductVariantOptionSelectionResponseDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class VariantPreviewItemResponseDto {
  @ApiProperty() label!: string;
  @ApiProperty() combinationKey!: string;
  @ApiProperty({ type: [String], format: 'ulid' }) optionValueIds!: string[];
  @ApiProperty() exists!: boolean;
}

export class VariantPreviewResponseDto {
  @ApiProperty() count!: number;
  @ApiProperty() limit!: number;
  @ApiProperty({ type: [VariantPreviewItemResponseDto] })
  combinations!: VariantPreviewItemResponseDto[];
}

export class ProductDeleteResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() deleted!: boolean;
}
