import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductOptionPresentationType } from '@/generated/prisma/client';

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

const stringList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : value;
  if (!Array.isArray(values)) return values;
  return values
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter(Boolean);
};

const booleanValue = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export enum StorefrontProductSort {
  POPULAR = 'popular',
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NAME_ASC = 'name_asc',
  RELEASE_ASC = 'release_asc',
}

export enum StorefrontAvailabilityStatus {
  IN_STOCK = 'IN_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export class PublicProductQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Trang không hợp lệ.' })
  @Min(1, { message: 'Trang không hợp lệ.' })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ enum: [12, 24, 36], default: 12 })
  @Type(() => Number)
  @IsInt({ message: 'Số sản phẩm mỗi trang không hợp lệ.' })
  @Min(12, { message: 'Số sản phẩm mỗi trang không hợp lệ.' })
  @Max(36, { message: 'Số sản phẩm mỗi trang không hợp lệ.' })
  @IsOptional()
  pageSize?: number = 12;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Từ khóa tìm kiếm không hợp lệ.' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @Transform(trimOptional)
  @IsString({ message: 'Danh mục không hợp lệ.' })
  @IsOptional()
  categorySlug?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá tối thiểu không hợp lệ.' })
  @Min(0, { message: 'Giá tối thiểu không hợp lệ.' })
  @IsOptional()
  priceMin?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá tối đa không hợp lệ.' })
  @Min(0, { message: 'Giá tối đa không hợp lệ.' })
  @IsOptional()
  priceMax?: number;

  @ApiPropertyOptional({ type: [String] })
  @Transform(stringList)
  @IsArray({ message: 'Tác giả không hợp lệ.' })
  @IsString({ each: true, message: 'Tác giả không hợp lệ.' })
  @IsOptional()
  author?: string[];

  @ApiPropertyOptional({ type: [String] })
  @Transform(stringList)
  @IsArray({ message: 'Nhà xuất bản không hợp lệ.' })
  @IsString({ each: true, message: 'Nhà xuất bản không hợp lệ.' })
  @IsOptional()
  publisher?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Bộ lọc thuộc tính dạng ATTRIBUTE_CODE:value',
  })
  @Transform(stringList)
  @IsArray({ message: 'Thuộc tính sản phẩm không hợp lệ.' })
  @Matches(/^[A-Za-z0-9_-]+:.+$/, {
    each: true,
    message: 'Thuộc tính sản phẩm không hợp lệ.',
  })
  @IsOptional()
  attribute?: string[];

  @ApiPropertyOptional()
  @Transform(booleanValue)
  @IsBoolean({ message: 'Bộ lọc khuyến mãi không hợp lệ.' })
  @IsOptional()
  onSale?: boolean;

  @ApiPropertyOptional()
  @Transform(booleanValue)
  @IsBoolean({ message: 'Bộ lọc sắp phát hành không hợp lệ.' })
  @IsOptional()
  upcoming?: boolean;

  @ApiPropertyOptional({
    enum: StorefrontProductSort,
    default: StorefrontProductSort.POPULAR,
  })
  @IsEnum(StorefrontProductSort, { message: 'Cách sắp xếp không hợp lệ.' })
  @IsOptional()
  sort?: StorefrontProductSort = StorefrontProductSort.POPULAR;
}

export class ProductAvailabilityQueryDto {
  @ApiPropertyOptional({ format: 'ulid' })
  @IsString({ message: 'Phiên bản sản phẩm không hợp lệ.' })
  @IsOptional()
  variantId?: string;
}

export class PublicCategoryResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uri' })
  imageUrl!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: () => [PublicCategoryResponseDto] })
  children!: PublicCategoryResponseDto[];
}

export class PublicNamedEntityDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class PublicProductMediaDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ format: 'uri' }) url!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) altText!:
    | string
    | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isPrimary!: boolean;
}

export class PublicPriceDto {
  @ApiProperty({ example: 125000 }) current!: number;
  @ApiProperty({ example: 155000 }) original!: number;
  @ApiProperty() onSale!: boolean;
  @ApiProperty({ minimum: 0, maximum: 100 }) discountPercent!: number;
}

export class PublicProductListItemDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: [PublicNamedEntityDto] })
  authors!: PublicNamedEntityDto[];
  @ApiPropertyOptional({ type: PublicNamedEntityDto, nullable: true })
  publisher!: PublicNamedEntityDto | null;
  @ApiProperty({ type: PublicProductMediaDto })
  primaryImage!: PublicProductMediaDto;
  @ApiProperty({ type: PublicPriceDto }) price!: PublicPriceDto;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  releaseDate!: string | null;
  @ApiPropertyOptional({ type: Number, minimum: 1, nullable: true }) rank!:
    | number
    | null;
}

export class PublicFacetItemDto {
  @ApiProperty() value!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ minimum: 0 }) count!: number;
}

export class PublicProductFacetsDto {
  @ApiProperty({ type: [PublicFacetItemDto] }) authors!: PublicFacetItemDto[];
  @ApiProperty({ type: [PublicFacetItemDto] })
  publishers!: PublicFacetItemDto[];
  @ApiProperty({ type: [PublicFacetItemDto] })
  categories!: PublicFacetItemDto[];
  @ApiProperty({ type: [PublicFacetItemDto] })
  attributes!: PublicFacetItemDto[];
}

export class PublicProductListResponseDto {
  @ApiProperty({ type: [PublicProductListItemDto] })
  items!: PublicProductListItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
  @ApiProperty({ enum: StorefrontProductSort }) sort!: StorefrontProductSort;
  @ApiProperty({ type: PublicProductFacetsDto })
  facets!: PublicProductFacetsDto;
}

export class PublicHomeResponseDto {
  @ApiProperty({ type: [PublicProductListItemDto] })
  bestSellers!: PublicProductListItemDto[];
  @ApiProperty({ type: [PublicProductListItemDto] })
  newest!: PublicProductListItemDto[];
  @ApiProperty({ type: [PublicProductListItemDto] })
  upcoming!: PublicProductListItemDto[];
}

export class PublicOptionValueDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() value!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) colorCode!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uri' })
  imageUrl!: string | null;
  @ApiProperty() sortOrder!: number;
}

export class PublicOptionDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: ProductOptionPresentationType })
  presentationType!: ProductOptionPresentationType;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: [PublicOptionValueDto] })
  values!: PublicOptionValueDto[];
}

export class PublicVariantOptionValueDto {
  @ApiProperty({ format: 'ulid' }) optionId!: string;
  @ApiProperty({ format: 'ulid' }) optionValueId!: string;
}

export class PublicVariantDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: PublicPriceDto }) price!: PublicPriceDto;
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
  @ApiProperty({ type: [PublicVariantOptionValueDto] })
  optionValues!: PublicVariantOptionValueDto[];
  @ApiProperty({ type: [PublicProductMediaDto] })
  media!: PublicProductMediaDto[];
}

export class PublicAttributeDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() value!: string;
}

export class PublicSeoDto {
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() canonicalPath!: string;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uri' })
  imageUrl!: string | null;
}

export class PublicProductDetailDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) shortDescription!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) description!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  releaseDate!: string | null;
  @ApiProperty({ type: [PublicCategoryResponseDto] })
  categories!: PublicCategoryResponseDto[];
  @ApiProperty({ type: [PublicNamedEntityDto] })
  authors!: PublicNamedEntityDto[];
  @ApiPropertyOptional({ type: PublicNamedEntityDto, nullable: true })
  publisher!: PublicNamedEntityDto | null;
  @ApiProperty({ type: [PublicProductMediaDto] })
  generalMedia!: PublicProductMediaDto[];
  @ApiProperty({ type: [PublicOptionDto] }) options!: PublicOptionDto[];
  @ApiProperty({ type: [PublicVariantDto] }) variants!: PublicVariantDto[];
  @ApiProperty({ type: [PublicAttributeDto] })
  attributes!: PublicAttributeDto[];
  @ApiProperty({ type: [PublicProductListItemDto] })
  relatedProducts!: PublicProductListItemDto[];
  @ApiProperty({ type: PublicSeoDto }) seo!: PublicSeoDto;
}

export class PublicBranchSummaryDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class PublicProductAvailabilityDto {
  @ApiProperty({ type: PublicBranchSummaryDto })
  branch!: PublicBranchSummaryDto;
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty({ format: 'ulid' }) variantId!: string;
  @ApiProperty({ minimum: 0 }) availableQuantity!: number;
  @ApiProperty({ enum: StorefrontAvailabilityStatus })
  status!: StorefrontAvailabilityStatus;
}
