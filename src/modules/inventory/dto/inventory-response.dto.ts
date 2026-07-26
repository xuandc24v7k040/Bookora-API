import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  InventoryMovementSourceType,
  InventoryMovementType,
  ProductStatus,
} from '@/generated/prisma/client';
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

export class InventoryStockVariantResponseDto extends BranchProductStockResponseDto {
  @ApiProperty() isDefault!: boolean;
}

export class InventoryProductStockResponseDto {
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) thumbnailUrl!:
    | string
    | null;
  @ApiProperty() isSimple!: boolean;
  @ApiProperty() variantCount!: number;
  @ApiProperty() totalQuantity!: number;
  @ApiProperty({ enum: StockState }) stockState!: StockState;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [InventoryStockVariantResponseDto] })
  variants!: InventoryStockVariantResponseDto[];
}

export class InventoryAdjustmentResponseDto {
  @ApiProperty({ format: 'ulid' }) variantId!: string;
  @ApiProperty({ minimum: 0 }) beforeQuantity!: number;
  @ApiProperty() quantityChange!: number;
  @ApiProperty({ minimum: 0 }) afterQuantity!: number;
  @ApiProperty({ format: 'ulid' }) movementId!: string;
  @ApiProperty({ format: 'ulid' }) receiptId!: string;
  @ApiProperty() receiptCode!: string;
}

export class InventoryMovementProductResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl!:
    | string
    | null;
}

export class InventoryMovementVariantResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() isDefault!: boolean;
}

export class InventoryMovementSourceResponseDto {
  @ApiProperty({ enum: InventoryMovementSourceType })
  type!: InventoryMovementSourceType;
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) code!: string | null;
}

export class InventoryMovementActorResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}

export class InventoryMovementResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ type: InventoryMovementProductResponseDto })
  product!: InventoryMovementProductResponseDto;
  @ApiProperty({ type: InventoryMovementVariantResponseDto })
  variant!: InventoryMovementVariantResponseDto;
  @ApiProperty() quantityChange!: number;
  @ApiProperty({ minimum: 0 }) beforeQuantity!: number;
  @ApiProperty({ minimum: 0 }) afterQuantity!: number;
  @ApiProperty({ enum: InventoryMovementType }) type!: InventoryMovementType;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiProperty({ type: InventoryMovementSourceResponseDto })
  source!: InventoryMovementSourceResponseDto;
  @ApiPropertyOptional({
    type: InventoryMovementActorResponseDto,
    nullable: true,
  })
  actor!: InventoryMovementActorResponseDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
