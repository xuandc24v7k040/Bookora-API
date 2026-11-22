import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CouponType,
  DiscountType,
  MembershipSource,
  MembershipTier,
} from '@/generated/prisma/client';
import { MAX_MEMBERSHIP_MONEY } from './membership-rules';

export class MembershipPageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page?: number;
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
export enum MemberSort {
  lifetimeSpend = 'lifetimeSpend',
  achievedAt = 'achievedAt',
  fullName = 'fullName',
}
export enum MemberSortOrder {
  asc = 'asc',
  desc = 'desc',
}
export class MembersQueryDto extends MembershipPageQueryDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
  @ApiPropertyOptional({ enum: MembershipTier })
  @IsOptional()
  @IsEnum(MembershipTier)
  tier?: MembershipTier;
  @ApiPropertyOptional({ enum: MemberSort })
  @IsOptional()
  @IsEnum(MemberSort)
  sortBy?: MemberSort;
  @ApiPropertyOptional({ enum: MemberSortOrder })
  @IsOptional()
  @IsEnum(MemberSortOrder)
  sortOrder?: MemberSortOrder;
}
export class UpdateMembershipThresholdsDto {
  @ApiProperty({ minimum: 1, maximum: MAX_MEMBERSHIP_MONEY })
  @IsInt({ message: 'Ngưỡng Bạc phải là số nguyên VND.' })
  @Min(1)
  @Max(MAX_MEMBERSHIP_MONEY)
  silver!: number;
  @ApiProperty({ minimum: 1, maximum: MAX_MEMBERSHIP_MONEY })
  @IsInt({ message: 'Ngưỡng Vàng phải là số nguyên VND.' })
  @Min(1)
  @Max(MAX_MEMBERSHIP_MONEY)
  gold!: number;
  @ApiProperty({ minimum: 1, maximum: MAX_MEMBERSHIP_MONEY })
  @IsInt({ message: 'Ngưỡng Kim cương phải là số nguyên VND.' })
  @Min(1)
  @Max(MAX_MEMBERSHIP_MONEY)
  diamond!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}
export class MembershipTierDto {
  @ApiProperty({ enum: MembershipTier }) tier!: MembershipTier;
  @ApiProperty() label!: string;
  @ApiProperty() threshold!: number;
}
export class MembershipConfigDto {
  @ApiProperty() silver!: number;
  @ApiProperty() gold!: number;
  @ApiProperty() diamond!: number;
  @ApiProperty() version!: number;
  @ApiProperty() pending!: boolean;
}
export class MembershipSummaryDto {
  @ApiProperty({ enum: MembershipTier }) currentTier!: MembershipTier;
  @ApiProperty() lifetimeSpend!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  achievedAt!: string | null;
  @ApiProperty({ type: [MembershipTierDto] }) tiers!: MembershipTierDto[];
  @ApiProperty({ type: MembershipTierDto, nullable: true })
  nextTier!: MembershipTierDto | null;
  @ApiProperty() remainingSpend!: number;
  @ApiProperty() progress!: number;
}
export class MemberDto extends MembershipSummaryDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ type: String, nullable: true }) fullName!: string | null;
  @ApiProperty() email!: string;
}
export class MembershipTransactionDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty() amount!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  effectiveAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ enum: MembershipSource }) source!: MembershipSource;
}
export class MembershipHistoryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MembershipTier }) fromTier!: MembershipTier;
  @ApiProperty({ enum: MembershipTier }) toTier!: MembershipTier;
  @ApiProperty({ enum: MembershipSource }) source!: MembershipSource;
  @ApiProperty({ type: String, nullable: true }) effectiveAt!: string | null;
  @ApiProperty() createdAt!: string;
}
export class MembershipCouponDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: CouponType }) type!: CouponType;
  @ApiProperty({ enum: DiscountType }) discountType!: DiscountType;
  @ApiProperty() discountValue!: number;
  @ApiProperty() minOrderAmount!: number;
  @ApiProperty({ type: Number, nullable: true }) maxDiscount!: number | null;
  @ApiProperty({ enum: MembershipTier }) minimumMembershipTier!: MembershipTier;
  @ApiProperty({ format: 'date-time' }) endAt!: string;
}
class MembershipPaginationDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
}
export class MembersListDto extends MembershipPaginationDto {
  @ApiProperty({ type: [MemberDto] }) items!: MemberDto[];
}
export class MembershipTransactionsDto extends MembershipPaginationDto {
  @ApiProperty({ type: [MembershipTransactionDto] })
  items!: MembershipTransactionDto[];
}
export class MembershipHistoriesDto extends MembershipPaginationDto {
  @ApiProperty({ type: [MembershipHistoryDto] }) items!: MembershipHistoryDto[];
}
export class MembershipCouponsDto extends MembershipPaginationDto {
  @ApiProperty({ type: [MembershipCouponDto] }) items!: MembershipCouponDto[];
}
