import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
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
  CouponType,
  CouponVisibility,
  DiscountType,
} from '@/generated/prisma/client';

export const normalizeCouponCode = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class SaveCouponDto {
  @ApiProperty({ minLength: 3, maxLength: 40, pattern: '^[A-Z0-9_-]+$' })
  @Transform(({ value }: { value: unknown }) => normalizeCouponCode(value))
  @IsString()
  @MinLength(3, { message: 'Mã cần ít nhất 3 ký tự.' })
  @MaxLength(40)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Mã chỉ gồm chữ, số, dấu gạch ngang và gạch dưới.',
  })
  code!: string;
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập tên ưu đãi.' })
  @MaxLength(120)
  name!: string;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiProperty({ enum: CouponType }) @IsEnum(CouponType) type!: CouponType;
  @ApiProperty({ enum: CouponVisibility })
  @IsEnum(CouponVisibility)
  visibility!: CouponVisibility;
  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discountType!: DiscountType;
  @ApiProperty({ minimum: 0.01, maximum: 9999999999 })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Giá trị giảm phải là số, tối đa 2 chữ số thập phân.' },
  )
  @Min(0.01, { message: 'Giá trị giảm phải lớn hơn 0.' })
  @Max(9_999_999_999, { message: 'Giá trị giảm vượt giới hạn 9.999.999.999đ.' })
  discountValue!: number;
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 9999999999,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt({ message: 'Đơn tối thiểu phải là số nguyên VND.' })
  @Min(0, { message: 'Đơn tối thiểu không được âm.' })
  @Max(9_999_999_999, { message: 'Đơn tối thiểu vượt giới hạn.' })
  minOrderAmount?: number | null;
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 9999999999,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt({ message: 'Mức giảm tối đa phải là số nguyên VND.' })
  @Min(0, { message: 'Mức giảm tối đa không được âm.' })
  @Max(9_999_999_999, { message: 'Mức giảm tối đa vượt giới hạn.' })
  maxDiscount?: number | null;
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 2147483647,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt({ message: 'Tổng lượt phải là số nguyên.' })
  @Min(1, { message: 'Tổng lượt phải lớn hơn 0.' })
  @Max(2_147_483_647, { message: 'Tổng lượt vượt giới hạn.' })
  usageLimit?: number | null;
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 2147483647,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt({ message: 'Lượt mỗi người phải là số nguyên.' })
  @Min(1, { message: 'Lượt mỗi người phải lớn hơn 0.' })
  @Max(2_147_483_647, { message: 'Lượt mỗi người vượt giới hạn.' })
  usageLimitPerUser?: number | null;
  @ApiProperty({ format: 'date-time' })
  @IsDateString({}, { message: 'Thời điểm bắt đầu không hợp lệ.' })
  startAt!: string;
  @ApiProperty({ format: 'date-time' })
  @IsDateString({}, { message: 'Thời điểm kết thúc không hợp lệ.' })
  endAt!: string;
  @ApiProperty() @IsBoolean() isActive!: boolean;
}

export enum CouponStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  UPCOMING = 'UPCOMING',
  EXPIRED = 'EXPIRED',
  EXHAUSTED = 'EXHAUSTED',
}
export enum CouponSort {
  code = 'code',
  name = 'name',
  startAt = 'startAt',
  endAt = 'endAt',
  createdAt = 'createdAt',
}
export enum CouponSortOrder {
  asc = 'asc',
  desc = 'desc',
}
export class CouponListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
  @ApiPropertyOptional({ enum: CouponType })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;
  @ApiPropertyOptional({ enum: CouponVisibility })
  @IsOptional()
  @IsEnum(CouponVisibility)
  visibility?: CouponVisibility;
  @ApiPropertyOptional({ enum: DiscountType })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;
  @ApiPropertyOptional({ enum: CouponStatus })
  @IsOptional()
  @IsEnum(CouponStatus)
  status?: CouponStatus;
  @ApiPropertyOptional({ enum: CouponSort })
  @IsOptional()
  @IsEnum(CouponSort)
  sortBy?: CouponSort;
  @ApiPropertyOptional({ enum: CouponSortOrder })
  @IsOptional()
  @IsEnum(CouponSortOrder)
  sortOrder?: CouponSortOrder;
}
export class CouponActiveDto {
  @ApiProperty() @IsBoolean() isActive!: boolean;
}

export class CouponResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: CouponType }) type!: CouponType;
  @ApiProperty({ enum: CouponVisibility }) visibility!: CouponVisibility;
  @ApiProperty({ enum: DiscountType }) discountType!: DiscountType;
  @ApiProperty() discountValue!: number;
  @ApiProperty({ type: Number, nullable: true }) minOrderAmount!: number | null;
  @ApiProperty({ type: Number, nullable: true }) maxDiscount!: number | null;
  @ApiProperty({ type: Number, nullable: true }) usageLimit!: number | null;
  @ApiProperty({ type: Number, nullable: true }) usageLimitPerUser!:
    | number
    | null;
  @ApiProperty({ format: 'date-time' }) startAt!: string;
  @ApiProperty({ format: 'date-time' }) endAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ enum: CouponStatus }) status!: CouponStatus;
  @ApiProperty() reserved!: number;
  @ApiProperty() consumed!: number;
  @ApiProperty({ type: Number, nullable: true }) remaining!: number | null;
}
export class CouponListResponseDto {
  @ApiProperty({ type: [CouponResponseDto] }) items!: CouponResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
}
export class CheckoutCouponDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: CouponType }) type!: CouponType;
  @ApiProperty({ enum: DiscountType }) discountType!: DiscountType;
  @ApiProperty() discountValue!: number;
  @ApiProperty() minOrderAmount!: number;
  @ApiProperty({ type: Number, nullable: true }) maxDiscount!: number | null;
  @ApiProperty() discountAmount!: number;
  @ApiProperty() selectable!: boolean;
  @ApiProperty({ type: String, nullable: true }) reasonCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) reasonMessage!: string | null;
}
export class OrderCouponSnapshotDto {
  @ApiProperty() code!: string;
  @ApiProperty({ enum: CouponType }) type!: CouponType;
  @ApiProperty() discountAmount!: number;
}
