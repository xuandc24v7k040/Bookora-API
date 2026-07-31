import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { OrderStatus, PaymentMethod } from '@/generated/prisma/client';
import type { AnalyticsPreset } from '@/modules/analytics/analytics-date-range';

export enum DashboardPreset {
  SEVEN_DAYS = '7D',
  THIRTY_DAYS = '30D',
  NINETY_DAYS = '90D',
}

export enum DashboardGroupBy {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export class DashboardOverviewQueryDto {
  @ApiPropertyOptional({
    enum: DashboardPreset,
    default: DashboardPreset.THIRTY_DAYS,
  })
  @IsOptional()
  @IsEnum(DashboardPreset)
  preset?: AnalyticsPreset;

  @ApiPropertyOptional({ format: 'date', example: '2026-07-01' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-07-30' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @ApiPropertyOptional({
    enum: DashboardGroupBy,
    default: DashboardGroupBy.DAY,
  })
  @IsOptional()
  @IsEnum(DashboardGroupBy)
  groupBy: DashboardGroupBy = DashboardGroupBy.DAY;
}

export class AnalyticsBranchDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
}

export class AnalyticsScopeDto {
  @ApiProperty({ enum: ['GLOBAL', 'BRANCH'] }) mode!: 'GLOBAL' | 'BRANCH';
  @ApiPropertyOptional({ type: AnalyticsBranchDto, nullable: true })
  branch!: AnalyticsBranchDto | null;
}

export class AnalyticsPeriodDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty() timezone!: string;
  @ApiPropertyOptional({ enum: DashboardPreset, nullable: true })
  preset!: AnalyticsPreset | null;
}

export class DashboardMetricDto {
  @ApiProperty() value!: number;
  @ApiProperty() previousValue!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  changePercent!: number | null;
}

export class DashboardKpisDto {
  @ApiProperty({ type: DashboardMetricDto })
  completedRevenue!: DashboardMetricDto;
  @ApiProperty({ type: DashboardMetricDto }) totalOrders!: DashboardMetricDto;
  @ApiProperty({ type: DashboardMetricDto }) soldQuantity!: DashboardMetricDto;
  @ApiProperty({ type: DashboardMetricDto })
  averageOrderValue!: DashboardMetricDto;
}

export class DashboardTrendPointDto {
  @ApiProperty({ format: 'date' }) key!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() completedOrders!: number;
}

export class DashboardOrderStatusDto {
  @ApiProperty({ enum: OrderStatus }) status!: OrderStatus;
  @ApiProperty() count!: number;
}

export class DashboardPaymentMethodDto {
  @ApiProperty({ enum: PaymentMethod }) method!: PaymentMethod;
  @ApiProperty() count!: number;
}

export class DashboardTopProductDto {
  @ApiProperty() productId!: string;
  @ApiProperty() productName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  variantLabel!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl!: string | null;
  @ApiProperty() soldQuantity!: number;
  @ApiProperty() revenue!: number;
}

export class DashboardLowStockDto {
  @ApiProperty({ format: 'ulid' }) branchId!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty({ format: 'ulid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({ format: 'ulid' }) variantId!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  variantLabel!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  imageUrl!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() lowStockThreshold!: number;
  @ApiProperty({ enum: ['LOW_STOCK', 'OUT_OF_STOCK'] })
  state!: 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export class DashboardBranchPerformanceDto {
  @ApiProperty({ format: 'ulid' }) branchId!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() revenue!: number;
  @ApiProperty() completedOrders!: number;
}

export class DashboardWeeklyPerformanceDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() revenue!: number;
  @ApiProperty() completedOrders!: number;
}

export class DashboardTodayOperationsDto {
  @ApiProperty({ format: 'date-time' }) snapshotAt!: string;
  @ApiProperty() pendingOrders!: number;
  @ApiProperty() completedToday!: number;
  @ApiProperty() cancelledToday!: number;
  @ApiProperty() completionRate!: number;
}

export class DashboardOverviewDto {
  @ApiProperty({ type: AnalyticsScopeDto }) scope!: AnalyticsScopeDto;
  @ApiProperty({ type: AnalyticsPeriodDto }) period!: AnalyticsPeriodDto;
  @ApiProperty({ type: AnalyticsPeriodDto })
  comparisonPeriod!: AnalyticsPeriodDto;
  @ApiProperty({ type: DashboardKpisDto }) kpis!: DashboardKpisDto;
  @ApiProperty({ type: [DashboardTrendPointDto] })
  revenueTrend!: DashboardTrendPointDto[];
  @ApiProperty({ type: [DashboardOrderStatusDto] })
  orderStatus!: DashboardOrderStatusDto[];
  @ApiProperty({ type: [DashboardPaymentMethodDto] })
  paymentMethods!: DashboardPaymentMethodDto[];
  @ApiProperty({ type: [DashboardTopProductDto] })
  topProducts!: DashboardTopProductDto[];
  @ApiProperty({ type: [DashboardLowStockDto] })
  lowStock!: DashboardLowStockDto[];
  @ApiPropertyOptional({ type: [DashboardBranchPerformanceDto] })
  branchPerformance?: DashboardBranchPerformanceDto[];
  @ApiPropertyOptional({ type: [DashboardWeeklyPerformanceDto] })
  weeklyPerformance?: DashboardWeeklyPerformanceDto[];
  @ApiPropertyOptional({ type: DashboardTodayOperationsDto })
  todayOperations?: DashboardTodayOperationsDto;
}
