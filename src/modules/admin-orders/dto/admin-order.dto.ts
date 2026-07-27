import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrderHistoryEventType,
  OrderStatus,
  OrderStatusActorType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionStatus,
} from '@/generated/prisma/client';

const toArray = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value) ? value : value === undefined ? undefined : [value];

export class AdminOrderListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: OrderStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(9)
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @ApiPropertyOptional({ enum: PaymentStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(7)
  @IsEnum(PaymentStatus, { each: true })
  paymentStatus?: PaymentStatus[];

  @ApiPropertyOptional({ enum: PaymentMethod, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @ArrayMaxSize(2)
  @IsEnum(PaymentMethod, { each: true })
  paymentMethod?: PaymentMethod[];

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['placedAt', 'totalAmount', 'status'] })
  @IsOptional()
  @IsIn(['placedAt', 'totalAmount', 'status'])
  sortBy?: 'placedAt' | 'totalAmount' | 'status' = 'placedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class AdminOrderTransitionDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  targetStatus!: OrderStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AdminOrderCancelDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminOrderInternalNoteDto {
  @ApiProperty({ maxLength: 2000, nullable: true })
  @IsString()
  @MaxLength(2000)
  note!: string;
}

export class AdminOrderAllowedActionsDto {
  @ApiProperty() confirm!: boolean;
  @ApiProperty() startPacking!: boolean;
  @ApiProperty() startShipping!: boolean;
  @ApiProperty() complete!: boolean;
  @ApiProperty() cancel!: boolean;
  @ApiProperty() updateInternalNote!: boolean;
}

export class AdminOrderCustomerReceiptConfirmationDto {
  @ApiProperty() confirmed!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  confirmedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  confirmedByName!: string | null;
}

export class AdminOrderCompletionReadinessDto {
  @ApiProperty() ready!: boolean;
  @ApiPropertyOptional({
    enum: ['WAITING_CUSTOMER_RECEIPT'],
    nullable: true,
  })
  reasonCode!: 'WAITING_CUSTOMER_RECEIPT' | null;
}

export class AdminOrderListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty() customerDisplay!: string;
  @ApiProperty() receiverPhone!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty() itemLineCount!: number;
  @ApiProperty() totalQuantity!: number;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty({ enum: PaymentMethod }) paymentMethod!: PaymentMethod;
  @ApiProperty({ enum: PaymentStatus }) paymentStatus!: PaymentStatus;
  @ApiProperty() customerReceiptConfirmed!: boolean;
  @ApiProperty() totalAmount!: number;
  @ApiProperty() placedAt!: string;
}

export class AdminOrderItemDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) productId!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) variantId!:
    | string
    | null;
  @ApiProperty() productName!: string;
  @ApiProperty() productSlug!: string;
  @ApiProperty() variantLabel!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  variantOptions!: object;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) sku!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPrice!: number;
  @ApiProperty() originalPrice!: number;
  @ApiProperty() discountAmount!: number;
  @ApiProperty() lineTotal!: number;
}

export class AdminOrderPaymentTransactionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PaymentProvider }) provider!: PaymentProvider;
  @ApiProperty({ enum: PaymentTransactionStatus })
  status!: PaymentTransactionStatus;
  @ApiProperty() amount!: number;
  @ApiPropertyOptional({ type: String, nullable: true })
  providerTransactionNo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) bankCode!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cardType!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) responseCode!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  transactionStatus!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) expiresAt!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) payDate!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  callbackReceivedAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class AdminOrderPaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PaymentMethod }) method!: PaymentMethod;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty() amount!: number;
  @ApiProperty() currency!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) paidAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [AdminOrderPaymentTransactionDto] })
  transactions!: AdminOrderPaymentTransactionDto[];
}

export class AdminOrderStatusHistoryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: OrderHistoryEventType })
  eventType!: OrderHistoryEventType;
  @ApiPropertyOptional({ enum: OrderStatus, nullable: true })
  fromStatus!: OrderStatus | null;
  @ApiPropertyOptional({ enum: OrderStatus, nullable: true })
  toStatus!: OrderStatus | null;
  @ApiProperty({ enum: OrderStatusActorType }) actorType!: OrderStatusActorType;
  @ApiPropertyOptional({ type: String, nullable: true }) actorUserId!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  actorDisplayName!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) actorRole!:
    | string
    | null;
  @ApiProperty() branchId!: string;
  @ApiProperty() branchName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reason!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: string;
}

export class AdminOrderDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() placedAt!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty() branchAddress!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() customerEmail!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerPhone!:
    | string
    | null;
  @ApiProperty() receiverName!: string;
  @ApiProperty() receiverPhone!: string;
  @ApiProperty() shippingAddress!: string;
  @ApiProperty() shippingServiceName!: string;
  @ApiProperty() shippingProvider!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  estimatedDeliveryAt!: string | null;
  @ApiProperty() subtotalAmount!: number;
  @ApiProperty() discountAmount!: number;
  @ApiProperty() shippingFee!: number;
  @ApiProperty() totalAmount!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) customerNote!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) internalNote!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  internalNoteUpdatedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cancelledAt!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cancelReason!:
    | string
    | null;
  @ApiProperty() itemLineCount!: number;
  @ApiProperty() totalQuantity!: number;
  @ApiProperty({ type: [AdminOrderItemDto] }) items!: AdminOrderItemDto[];
  @ApiProperty({ type: AdminOrderPaymentDto, nullable: true })
  payment!: AdminOrderPaymentDto | null;
  @ApiProperty({ type: [AdminOrderStatusHistoryDto] })
  history!: AdminOrderStatusHistoryDto[];
  @ApiProperty({ type: AdminOrderCustomerReceiptConfirmationDto })
  customerReceiptConfirmation!: AdminOrderCustomerReceiptConfirmationDto;
  @ApiProperty({ type: AdminOrderCompletionReadinessDto })
  completionReadiness!: AdminOrderCompletionReadinessDto;
  @ApiProperty({ type: AdminOrderAllowedActionsDto })
  allowedActions!: AdminOrderAllowedActionsDto;
}
