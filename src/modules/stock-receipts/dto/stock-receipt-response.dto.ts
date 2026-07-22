import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus, StockReceiptStatus } from '@/generated/prisma/client';

export class StockReceiptPartyResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
}

export class StockReceiptUserResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
}

export class StockReceiptItemResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ format: 'ulid' }) variantId!: string;
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() variantName!: string;
  @ApiProperty() sku!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) barcode!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) optionSummary!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) thumbnailUrl!:
    | string
    | null;
  @ApiProperty() variantActive!: boolean;
  @ApiProperty({ enum: ProductStatus }) productStatus!: ProductStatus;
  @ApiProperty({ minimum: 1 }) quantity!: number;
  @ApiPropertyOptional({ type: String, nullable: true, example: '178000.00' })
  costPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, example: '356000.00' })
  lineTotal!: string | null;
}

export class StockReceiptListItemResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiPropertyOptional({ type: StockReceiptPartyResponseDto, nullable: true })
  supplier!: StockReceiptPartyResponseDto | null;
  @ApiProperty({ enum: StockReceiptStatus }) status!: StockReceiptStatus;
  @ApiProperty() itemCount!: number;
  @ApiProperty() totalQuantity!: number;
  @ApiProperty({ type: String, example: '534000.00' }) totalCostAmount!: string;
  @ApiPropertyOptional({ type: StockReceiptUserResponseDto, nullable: true })
  createdBy!: StockReceiptUserResponseDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ type: StockReceiptUserResponseDto, nullable: true })
  confirmedBy!: StockReceiptUserResponseDto | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  confirmedAt!: string | null;
}

export class StockReceiptDetailResponseDto extends StockReceiptListItemResponseDto {
  @ApiProperty({ type: StockReceiptPartyResponseDto })
  branch!: StockReceiptPartyResponseDto;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ type: [StockReceiptItemResponseDto] })
  items!: StockReceiptItemResponseDto[];
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
