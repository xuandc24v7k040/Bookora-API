import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@/generated/prisma/client';

function orderStatuses({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) =>
    typeof item === 'string' ? item.split(',') : [item],
  );
}

export class CustomerOrderListQueryDto {
  @ApiPropertyOptional({
    enum: OrderStatus,
    isArray: true,
    description:
      'Lọc theo một hoặc nhiều trạng thái. Hỗ trợ repeated query hoặc comma-separated.',
  })
  @Transform(orderStatuses)
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  @IsOptional()
  status?: OrderStatus[];

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  limit?: number = 5;
}

export class CancelCustomerOrderDto {
  @IsOptional()
  @IsString()
  @Length(1, 300)
  reason?: string;
}

export class CustomerOrderItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  productId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  variantId!: string | null;

  @ApiProperty()
  productName!: string;

  @ApiProperty()
  productSlug!: string;

  @ApiProperty()
  variantLabel!: string;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['name', 'value'],
    },
  })
  variantOptions!: Array<{ name: string; value: string }>;

  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty()
  lineTotal!: number;
}

export class CustomerOrderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  orderCode!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty()
  subtotalAmount!: number;

  @ApiProperty()
  discountAmount!: number;

  @ApiProperty()
  shippingFee!: number;

  @ApiProperty()
  receiverName!: string;

  @ApiProperty()
  receiverPhone!: string;

  @ApiProperty()
  shippingAddress!: string;

  @ApiProperty()
  branchName!: string;

  @ApiProperty()
  branchId!: string;

  @ApiProperty()
  shippingServiceName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @ApiProperty()
  placedAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  cancelReason!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  paymentId!: string | null;

  @ApiProperty({ type: [CustomerOrderItemResponseDto] })
  items!: CustomerOrderItemResponseDto[];
}

export class CustomerOrderListResponseDto {
  @ApiProperty({ type: [CustomerOrderResponseDto] })
  items!: CustomerOrderResponseDto[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  limit!: number;

  @ApiProperty({ minimum: 0 })
  totalItems!: number;

  @ApiProperty({ minimum: 1 })
  totalPages!: number;
}
