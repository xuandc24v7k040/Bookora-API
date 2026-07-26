import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { InventoryMovementType } from '@/generated/prisma/client';
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

export enum GroupedStockSortField {
  PRODUCT_NAME = 'productName',
  QUANTITY = 'quantity',
  UPDATED_AT = 'updatedAt',
}

export enum InventoryAdjustmentDirection {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
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

export class GroupedStockListQueryDto extends InventoryVariantOptionsQueryDto {
  @ApiPropertyOptional({ enum: StockState })
  @IsOptional()
  @IsEnum(StockState)
  stockState?: StockState;

  @ApiPropertyOptional({ enum: GroupedStockSortField })
  @IsOptional()
  @IsEnum(GroupedStockSortField)
  sortBy?: GroupedStockSortField;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;
}

export class InventoryMovementListQueryDto extends InventoryVariantOptionsQueryDto {
  @ApiPropertyOptional({ enum: InventoryMovementType })
  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu không hợp lệ' })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc không hợp lệ' })
  dateTo?: string;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;
}

export class AdjustInventoryQuantityDto {
  @ApiProperty({ minimum: 0, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt({ message: 'Tồn hiện tại phải là số nguyên không âm' })
  @Min(0, { message: 'Tồn hiện tại phải là số nguyên không âm' })
  @Max(2_147_483_647)
  expectedCurrentQuantity!: number;

  @ApiProperty({ enum: InventoryAdjustmentDirection })
  @IsEnum(InventoryAdjustmentDirection, {
    message: 'Loại điều chỉnh không hợp lệ',
  })
  direction!: InventoryAdjustmentDirection;

  @ApiProperty({ minimum: 1, maximum: 1000 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng điều chỉnh phải là số nguyên lớn hơn 0' })
  @Min(1, { message: 'Số lượng điều chỉnh phải là số nguyên lớn hơn 0' })
  @Max(1000, { message: 'Số lượng điều chỉnh không được vượt quá 1000' })
  quantity!: number;

  @ApiProperty({ maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1000, { message: 'Ghi chú không được vượt quá 1000 ký tự' })
  @Matches(/\S/, { message: 'Vui lòng nhập ghi chú điều chỉnh' })
  note!: string;
}

export class UpdateLowStockThresholdDto {
  @ApiProperty({ minimum: 0, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt({ message: 'Ngưỡng cảnh báo phải là số nguyên không âm' })
  @Min(0, { message: 'Ngưỡng cảnh báo phải là số nguyên không âm' })
  @Max(2_147_483_647)
  lowStockThreshold!: number;
}
