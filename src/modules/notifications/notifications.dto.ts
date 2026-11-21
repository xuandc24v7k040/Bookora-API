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

export enum NotificationFilter {
  ORDER = 'ORDER',
  PROMOTION = 'PROMOTION',
}
export enum NotificationSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}
export class NotificationsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
  @ApiPropertyOptional({ enum: NotificationFilter })
  @IsOptional()
  @IsEnum(NotificationFilter)
  category?: NotificationFilter;
  @ApiPropertyOptional({
    enum: NotificationSort,
    default: NotificationSort.NEWEST,
  })
  @IsOptional()
  @IsEnum(NotificationSort)
  sort?: NotificationSort;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unreadOnly?: boolean;
}

export class NotificationItemDto {
  @ApiProperty({ type: String, nullable: true }) couponCode!: string | null;
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty({ enum: NotificationFilter }) category!: NotificationFilter;
  @ApiProperty() title!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, nullable: true }) branchId!: string | null;
  @ApiProperty() referenceType!: string;
  @ApiProperty() referenceId!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) readAt!:
    | string
    | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class NotificationListDto {
  @ApiProperty({ type: [NotificationItemDto] }) items!: NotificationItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
}
export class NotificationCountDto {
  @ApiProperty() count!: number;
}
