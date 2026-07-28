import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const REVIEW_CONTENT_MAX_LENGTH = 2000;

const trimNullable = ({ value }: { value: unknown }): unknown => {
  if (value === null || value === undefined) return value;
  return typeof value === 'string' ? value.trim() || null : value;
};

const optionalBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class CreateReviewDto {
  @ApiProperty({ format: 'ulid' })
  @IsString()
  orderId!: string;

  @ApiProperty({ format: 'ulid' })
  @IsString()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt({ message: 'Số sao đánh giá không hợp lệ.' })
  @Min(1, { message: 'Đánh giá tối thiểu 1 sao.' })
  @Max(5, { message: 'Đánh giá tối đa 5 sao.' })
  rating!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: REVIEW_CONTENT_MAX_LENGTH,
  })
  @Transform(trimNullable)
  @IsString({ message: 'Nội dung đánh giá không hợp lệ.' })
  @MaxLength(REVIEW_CONTENT_MAX_LENGTH, {
    message: `Nội dung đánh giá không được vượt quá ${REVIEW_CONTENT_MAX_LENGTH} ký tự.`,
  })
  @IsOptional()
  content?: string | null;
}

export class UpdateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt({ message: 'Số sao đánh giá không hợp lệ.' })
  @Min(1, { message: 'Đánh giá tối thiểu 1 sao.' })
  @Max(5, { message: 'Đánh giá tối đa 5 sao.' })
  rating!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: REVIEW_CONTENT_MAX_LENGTH,
  })
  @Transform(trimNullable)
  @IsString({ message: 'Nội dung đánh giá không hợp lệ.' })
  @MaxLength(REVIEW_CONTENT_MAX_LENGTH, {
    message: `Nội dung đánh giá không được vượt quá ${REVIEW_CONTENT_MAX_LENGTH} ký tự.`,
  })
  @IsOptional()
  content?: string | null;
}

export class PublicReviewQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Chỉ lấy đánh giá từ lượt mua đã được xác minh',
  })
  @Transform(optionalBoolean)
  @IsBoolean()
  @IsOptional()
  verifiedPurchase?: boolean;
}

class ReviewPaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  limit?: number = 10;
}

export class CustomerReviewListQueryDto extends ReviewPaginationQueryDto {
  @ApiPropertyOptional({ format: 'ulid' })
  @IsString()
  @IsOptional()
  orderId?: string;
}

export class PendingReviewQueryDto extends ReviewPaginationQueryDto {
  @ApiPropertyOptional({ format: 'ulid' })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ format: 'ulid' })
  @IsString()
  @IsOptional()
  orderId?: string;
}

export enum AdminReviewSortBy {
  PRODUCT_NAME = 'productName',
  ORDER_CODE = 'orderCode',
  CUSTOMER_NAME = 'customerName',
  BRANCH_NAME = 'branchName',
  IS_VISIBLE = 'isVisible',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  RATING = 'rating',
}

export enum ReviewSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class AdminReviewListQueryDto extends ReviewPaginationQueryDto {
  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional({ type: Boolean })
  @Transform(optionalBoolean)
  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;

  @ApiPropertyOptional({ format: 'ulid' })
  @IsString()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({
    enum: AdminReviewSortBy,
    default: AdminReviewSortBy.CREATED_AT,
  })
  @IsEnum(AdminReviewSortBy)
  @IsOptional()
  sortBy?: AdminReviewSortBy = AdminReviewSortBy.CREATED_AT;

  @ApiPropertyOptional({ enum: ReviewSortOrder, default: ReviewSortOrder.DESC })
  @IsEnum(ReviewSortOrder)
  @IsOptional()
  sortOrder?: ReviewSortOrder = ReviewSortOrder.DESC;
}

export class ReviewVisibilityDto {
  @ApiProperty()
  @IsBoolean()
  isVisible!: boolean;
}

export class ReviewDeletedDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
}

export class ReviewProductDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) imageUrl!:
    | string
    | null;
}

export class CustomerReviewDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ format: 'ulid' }) orderId!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty({ type: ReviewProductDto }) product!: ReviewProductDto;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) content!:
    | string
    | null;
  @ApiProperty() isVisible!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CustomerReviewListDto {
  @ApiProperty({ type: [CustomerReviewDto] }) items!: CustomerReviewDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
}

export class PendingReviewOpportunityDto {
  @ApiProperty({ format: 'ulid' }) orderId!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty({ type: ReviewProductDto }) product!: ReviewProductDto;
  @ApiProperty({ format: 'date-time' }) completedAt!: string;
}

export class PendingReviewListDto {
  @ApiProperty({ type: [PendingReviewOpportunityDto] })
  items!: PendingReviewOpportunityDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
}

export class PublicReviewerDto {
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!:
    | string
    | null;
}

export class PublicReviewDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ type: PublicReviewerDto }) reviewer!: PublicReviewerDto;
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) content!:
    | string
    | null;
  @ApiProperty() verifiedPurchase!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PublicReviewRatingDistributionDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) rating!: number;
  @ApiProperty({ minimum: 0 }) count!: number;
}

export class PublicReviewListDto {
  @ApiProperty({ type: [PublicReviewDto] }) items!: PublicReviewDto[];
  @ApiProperty() page!: number;
  @ApiProperty({ default: 5 }) pageSize!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) averageRating!:
    | number
    | null;
  @ApiProperty() reviewCount!: number;
  @ApiProperty({ type: [PublicReviewRatingDistributionDto] })
  ratingDistribution!: PublicReviewRatingDistributionDto[];
}

export class AdminReviewDto extends CustomerReviewDto {
  @ApiProperty() customerName!: string;
  @ApiProperty() customerEmail!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) customerAvatarUrl!:
    | string
    | null;
  @ApiProperty({ format: 'ulid' }) branchId!: string;
  @ApiProperty() branchName!: string;
}

export class AdminReviewListDto {
  @ApiProperty({ type: [AdminReviewDto] }) items!: AdminReviewDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
}
