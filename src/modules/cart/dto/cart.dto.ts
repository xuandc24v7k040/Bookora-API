import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export enum CartItemStatus {
  AVAILABLE = 'AVAILABLE',
  PRICE_CHANGED = 'PRICE_CHANGED',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  PRODUCT_INACTIVE = 'PRODUCT_INACTIVE',
  VARIANT_INACTIVE = 'VARIANT_INACTIVE',
  BRANCH_INACTIVE = 'BRANCH_INACTIVE',
}

export class AddCartItemDto {
  @ApiProperty({ format: 'ulid' })
  @IsString({ message: 'Phiên bản sản phẩm không hợp lệ.' })
  productVariantId!: string;

  @ApiProperty({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng phải ít nhất là 1.' })
  quantity!: number;
}

export class UpdateCartItemQuantityDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng phải ít nhất là 1.' })
  quantity!: number;
}

export class CartBranchDto {
  @ApiProperty({ format: 'ulid' })
  @IsString({ message: 'Chi nhánh không hợp lệ.' })
  branchId!: string;
}

export class CartBranchResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) province!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ward!: string | null;
  @ApiProperty() isActive!: boolean;
}

export class CartVariantOptionDto {
  @ApiProperty() name!: string;
  @ApiProperty() value!: string;
}

export class CartItemResponseDto {
  @ApiProperty({ format: 'ulid' }) cartItemId!: string;
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty() productSlug!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({ format: 'ulid' }) productVariantId!: string;
  @ApiProperty() variantLabel!: string;
  @ApiProperty({ type: [CartVariantOptionDto] })
  options!: CartVariantOptionDto[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uri' })
  primaryImageUrl!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() availableQuantity!: number;
  @ApiProperty() currentUnitPrice!: number;
  @ApiProperty() previousUnitPrice!: number;
  @ApiProperty() originalPrice!: number;
  @ApiProperty() discount!: number;
  @ApiProperty() lineSubtotal!: number;
  @ApiProperty({ enum: CartItemStatus }) primaryStatus!: CartItemStatus;
  @ApiProperty({ enum: CartItemStatus, isArray: true })
  issues!: CartItemStatus[];
  @ApiProperty() isSelectable!: boolean;
  @ApiProperty() isQuantityEditable!: boolean;
  @ApiProperty() isCheckoutEligible!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) message!:
    | string
    | null;
}

export class CartResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true, format: 'ulid' })
  cartId!: string | null;
  @ApiProperty({ type: CartBranchResponseDto })
  branch!: CartBranchResponseDto;
  @ApiProperty({ type: [CartItemResponseDto] }) items!: CartItemResponseDto[];
  @ApiProperty() itemCount!: number;
  @ApiProperty() totalQuantity!: number;
  @ApiProperty() subtotalAllEligible!: number;
  @ApiProperty() hasBlockingIssues!: boolean;
  @ApiProperty({ enum: CartItemStatus, isArray: true })
  blockingIssues!: CartItemStatus[];
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  updatedAt!: string | null;
}
