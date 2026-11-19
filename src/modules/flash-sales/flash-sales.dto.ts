import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FLASH_SALE_STATUSES,
  type FlashSaleStatus,
} from './flash-sale-pricing';

export class SaveFlashSaleItemDto {
  @ApiProperty()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/i, { message: 'Biến thể không hợp lệ.' })
  variantId!: string;
  @ApiProperty({ minimum: 1, maximum: 9999999999 })
  @IsInt({ message: 'Giá phải là số nguyên VND.' })
  @Min(1)
  @Max(9_999_999_999)
  flashPrice!: number;
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  totalQuota!: number;
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  maxQuantityPerUser!: number;
}
export class SaveFlashSaleDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập tên chương trình.' })
  @MaxLength(120)
  name!: string;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiProperty({ format: 'date-time' })
  @IsDateString({}, { message: 'Thời gian bắt đầu không hợp lệ.' })
  startAt!: string;
  @ApiProperty({ format: 'date-time' })
  @IsDateString({}, { message: 'Thời gian kết thúc không hợp lệ.' })
  endAt!: string;
  @ApiProperty({ type: [SaveFlashSaleItemDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1, { message: 'Chọn ít nhất một biến thể.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaveFlashSaleItemDto)
  items!: SaveFlashSaleItemDto[];
}
export class FlashSaleListQueryDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
  @ApiPropertyOptional({ enum: [...FLASH_SALE_STATUSES] })
  @IsOptional()
  @IsIn(FLASH_SALE_STATUSES)
  status?: FlashSaleStatus;
  @ApiPropertyOptional({ enum: ['name', 'startAt', 'endAt', 'createdAt'] })
  @IsOptional()
  @IsIn(['name', 'startAt', 'endAt', 'createdAt'])
  sortBy?: 'name' | 'startAt' | 'endAt' | 'createdAt';
  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
export class FlashSaleControlDto {
  @ApiProperty({ enum: ['publish', 'cancel', 'stop'] })
  @IsIn(['publish', 'cancel', 'stop'])
  action!: 'publish' | 'cancel' | 'stop';
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
export class FlashSaleVariantDto {
  @ApiPropertyOptional() isSimple?: boolean;
  @ApiProperty() variantId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() productSlug!: string;
  @ApiProperty() variantLabel!: string;
  @ApiProperty({ type: String, nullable: true }) sku!: string | null;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty() catalogPrice!: number;
  @ApiProperty() globalAvailableStock!: number;
}
export class FlashSaleItemDto extends FlashSaleVariantDto {
  @ApiProperty() id!: string;
  @ApiProperty() flashPrice!: number;
  @ApiProperty() referencePrice!: number;
  @ApiProperty() discountPercent!: number;
  @ApiProperty() totalQuota!: number;
  @ApiProperty() maxQuantityPerUser!: number;
  @ApiProperty() consumed!: number;
  @ApiProperty() reserved!: number;
  @ApiProperty() remaining!: number;
}
export class FlashSaleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) startAt!: string;
  @ApiProperty({ format: 'date-time' }) endAt!: string;
  @ApiProperty({ format: 'date-time' }) serverNow!: string;
  @ApiProperty({ enum: [...FLASH_SALE_STATUSES] }) status!: FlashSaleStatus;
  @ApiProperty() itemCount!: number;
  @ApiProperty({ type: [FlashSaleItemDto] }) items!: FlashSaleItemDto[];
  @ApiProperty({ type: String, nullable: true }) controlReason!: string | null;
}
export class FlashSaleListResponseDto {
  @ApiProperty({ type: [FlashSaleResponseDto] }) items!: FlashSaleResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
}
export class FlashSaleVariantListDto {
  @ApiProperty({ type: [FlashSaleVariantDto] }) items!: FlashSaleVariantDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
}
export class FlashSaleOfferDto {
  @ApiProperty() itemId!: string;
  @ApiProperty() flashSaleId!: string;
  @ApiProperty() flashPrice!: number;
  @ApiProperty() catalogPrice!: number;
  @ApiProperty() discountPercent!: number;
  @ApiProperty() remaining!: number;
  @ApiProperty() totalQuota!: number;
  @ApiProperty() maxQuantityPerUser!: number;
  @ApiProperty() userRemaining!: number;
  @ApiProperty({ format: 'date-time' }) endAt!: string;
  @ApiProperty({ format: 'date-time' }) serverNow!: string;
}
export class FlashSaleEligibilityDto {
  @ApiProperty({ type: FlashSaleOfferDto, nullable: true })
  offer!: FlashSaleOfferDto | null;
}
