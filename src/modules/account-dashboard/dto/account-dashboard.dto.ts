import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@/generated/prisma/client';
import { WishlistItemDto } from '@/modules/wishlists/dto';

export class AccountDashboardLatestOrderDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() customerConfirmedReceived!: boolean;
  @ApiProperty() totalAmount!: number;
  @ApiProperty({ format: 'date-time' }) placedAt!: string;
  @ApiProperty() itemCount!: number;
  @ApiProperty() totalQuantity!: number;
  @ApiProperty() productName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) productImageUrl!:
    | string
    | null;
}

export class AccountDashboardDto {
  @ApiProperty() totalOrders!: number;
  @ApiProperty() totalSpent!: number;
  @ApiProperty() writtenReviewCount!: number;
  @ApiProperty() shippingOrderCount!: number;
  @ApiProperty() pendingReviewCount!: number;
  @ApiPropertyOptional({ type: AccountDashboardLatestOrderDto, nullable: true })
  latestOrder!: AccountDashboardLatestOrderDto | null;
  @ApiProperty({ type: [WishlistItemDto] })
  latestWishlistItems!: WishlistItemDto[];
}
