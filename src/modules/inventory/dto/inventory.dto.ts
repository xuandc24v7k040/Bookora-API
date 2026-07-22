import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { SortDirection } from '@/common/enums';

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export enum StockState {
  IN_STOCK = 'IN_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export enum StockSortField {
  PRODUCT_NAME = 'productName',
  SKU = 'sku',
  QUANTITY = 'quantity',
  LOW_STOCK_THRESHOLD = 'lowStockThreshold',
  UPDATED_AT = 'updatedAt',
}

export class InventoryVariantOptionsQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  search?: string;
}

export class StockListQueryDto extends InventoryVariantOptionsQueryDto {
  @ApiPropertyOptional({ enum: StockState })
  @IsOptional()
  @IsEnum(StockState)
  stockState?: StockState;

  @ApiPropertyOptional({ enum: StockSortField })
  @IsOptional()
  @IsEnum(StockSortField)
  sortBy?: StockSortField;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;
}

export class UpdateLowStockThresholdDto {
  @ApiProperty({ minimum: 0, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt({ message: 'Ngưỡng cảnh báo phải là số nguyên không âm' })
  @Min(0, { message: 'Ngưỡng cảnh báo phải là số nguyên không âm' })
  @Max(2_147_483_647)
  lowStockThreshold!: number;
}
