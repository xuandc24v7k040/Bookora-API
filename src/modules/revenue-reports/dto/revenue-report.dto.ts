import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  AnalyticsPeriodDto,
  AnalyticsScopeDto,
  DashboardPreset,
} from '@/modules/dashboard/dto';
import type { AnalyticsPreset } from '@/modules/analytics/analytics-date-range';

export enum RevenueGroupBy {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export enum RevenuePaymentMethod {
  ALL = 'ALL',
  COD = 'COD',
  VNPAY = 'VNPAY',
}

export enum RevenueSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class RevenueReportQueryDto {
  @ApiPropertyOptional({ enum: DashboardPreset })
  @IsOptional()
  @IsEnum(DashboardPreset)
  preset?: AnalyticsPreset;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @ApiPropertyOptional({ enum: RevenueGroupBy, default: RevenueGroupBy.DAY })
  @IsOptional()
  @IsEnum(RevenueGroupBy)
  groupBy: RevenueGroupBy = RevenueGroupBy.DAY;

  @ApiPropertyOptional({
    enum: RevenuePaymentMethod,
    default: RevenuePaymentMethod.ALL,
  })
  @IsOptional()
  @IsEnum(RevenuePaymentMethod)
  paymentMethod: RevenuePaymentMethod = RevenuePaymentMethod.ALL;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({
    enum: RevenueSortOrder,
    default: RevenueSortOrder.ASC,
  })
  @IsOptional()
  @IsEnum(RevenueSortOrder)
  sortOrder: RevenueSortOrder = RevenueSortOrder.ASC;
}

export class RevenueBranchDto {
  @ApiProperty({ format: 'ulid' }) branchId!: string;
  @ApiProperty() branchCode!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() completedOrders!: number;
  @ApiProperty() soldQuantity!: number;
  @ApiProperty() totalRevenue!: number;
  @ApiProperty() averageOrderValue!: number;
}

export class RevenueSummaryDto {
  @ApiProperty({ type: AnalyticsScopeDto }) scope!: AnalyticsScopeDto;
  @ApiProperty({ type: AnalyticsPeriodDto }) period!: AnalyticsPeriodDto;
  @ApiProperty({ enum: RevenueGroupBy }) groupBy!: RevenueGroupBy;
  @ApiProperty({ enum: RevenuePaymentMethod })
  paymentMethod!: RevenuePaymentMethod;
  @ApiProperty() completedRevenue!: number;
  @ApiProperty() completedOrders!: number;
  @ApiProperty() soldQuantity!: number;
  @ApiProperty() averageOrderValue!: number;
  @ApiProperty() merchandiseRevenue!: number;
  @ApiProperty() shippingRevenue!: number;
  @ApiProperty() completionRate!: number;
  @ApiPropertyOptional({ type: RevenueBranchDto, nullable: true })
  leadingBranch!: RevenueBranchDto | null;
}

export class RevenueTrendBucketDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty() completedOrders!: number;
  @ApiProperty() soldQuantity!: number;
  @ApiProperty() merchandiseRevenue!: number;
  @ApiProperty() shippingRevenue!: number;
  @ApiProperty() totalRevenue!: number;
  @ApiProperty() averageOrderValue!: number;
}

export class RevenueTrendDto {
  @ApiProperty({ type: [RevenueTrendBucketDto] })
  items!: RevenueTrendBucketDto[];
}

export class RevenueBranchesDto {
  @ApiProperty({ type: [RevenueBranchDto] }) items!: RevenueBranchDto[];
}

export class RevenueTableRowDto extends RevenueTrendBucketDto {}
