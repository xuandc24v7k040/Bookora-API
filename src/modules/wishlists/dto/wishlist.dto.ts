import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const stringList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) =>
      typeof item === 'string'
        ? item.split(',').map((part) => part.trim())
        : [item],
    )
    .filter(Boolean);
};

export class WishlistListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 24, default: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  limit?: number = 12;
}

export class WishlistStatusQueryDto {
  @ApiProperty({ type: [String], maxItems: 100 })
  @Transform(stringList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  productIds!: string[];
}

export class WishlistPriceDto {
  @ApiPropertyOptional({ type: Number, nullable: true }) current!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) original!:
    | number
    | null;
  @ApiProperty() onSale!: boolean;
  @ApiProperty() discountPercent!: number;
}

export class WishlistProductDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: [String] }) authors!: string[];
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl!:
    | string
    | null;
  @ApiProperty({ type: WishlistPriceDto }) price!: WishlistPriceDto;
  @ApiProperty() isAvailable!: boolean;
  @ApiPropertyOptional({ type: Number, nullable: true }) averageRating!:
    | number
    | null;
  @ApiProperty() reviewCount!: number;
}

export class WishlistItemDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: WishlistProductDto }) product!: WishlistProductDto;
}

export class WishlistListDto {
  @ApiProperty({ type: [WishlistItemDto] }) items!: WishlistItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
}

export class WishlistStateDto {
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty() isWishlisted!: boolean;
}

export class WishlistStatusDto {
  @ApiProperty({ type: [String] }) wishlistedProductIds!: string[];
}
