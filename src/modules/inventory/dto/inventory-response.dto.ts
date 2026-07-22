import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@/generated/prisma/client';
import { StockState } from './inventory.dto';

export class InventoryVariantOptionResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() variantName!: string;
  @ApiProperty() sku!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) barcode!:
    | string
    | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ enum: ProductStatus }) productStatus!: ProductStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) optionSummary!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) thumbnailUrl!:
    | string
    | null;
}

export class BranchProductStockResponseDto {
  @ApiProperty({ format: 'ulid' }) variantId!: string;
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() variantName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) optionSummary!:
    | string
    | null;
  @ApiProperty() sku!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) barcode!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) thumbnailUrl!:
    | string
    | null;
  @ApiProperty({ minimum: 0 }) quantity!: number;
  @ApiProperty({ minimum: 0 }) lowStockThreshold!: number;
  @ApiProperty({ enum: StockState }) stockState!: StockState;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
