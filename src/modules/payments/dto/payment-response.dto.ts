import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrderStatus,
  PaymentStatus,
  PaymentTransactionStatus,
} from '@/generated/prisma/client';

export class PaymentTransactionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: PaymentTransactionStatus })
  status!: PaymentTransactionStatus;

  @ApiProperty()
  merchantTxnRef!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  responseCode!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  providerTransactionNo!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class PaymentStatusResponseDto {
  @ApiProperty()
  paymentId!: string;

  @ApiProperty()
  orderId!: string;

  @ApiProperty()
  orderCode!: string;

  @ApiProperty({ enum: OrderStatus })
  orderStatus!: OrderStatus;

  @ApiProperty({ enum: PaymentStatus })
  paymentStatus!: PaymentStatus;

  @ApiProperty({ type: [PaymentTransactionResponseDto] })
  transactions!: PaymentTransactionResponseDto[];
}

export class RetryPaymentResponseDto {
  @ApiProperty()
  paymentId!: string;

  @ApiProperty()
  paymentTransactionId!: string;

  @ApiProperty()
  paymentUrl!: string;
}
