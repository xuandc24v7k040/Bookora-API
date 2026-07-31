import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { BranchContext } from '@/modules/authorization';
import {
  ANALYTICS_TIMEZONE,
  resolveAnalyticsDateRange,
} from '@/modules/analytics/analytics-date-range';
import {
  percentageChange,
  resolveAnalyticsScope,
} from '@/modules/analytics/analytics-scope';
import { DashboardRepository } from './dashboard.repository';
import type {
  DashboardMetricDto,
  DashboardOverviewDto,
  DashboardOverviewQueryDto,
} from './dto';
import { DashboardGroupBy } from './dto';

@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async overview(
    actor: AuthenticatedUser,
    context: BranchContext,
    query: DashboardOverviewQueryDto,
  ): Promise<DashboardOverviewDto> {
    const scope = resolveAnalyticsScope(actor, context);
    const range = resolveAnalyticsDateRange(query);
    const previousRange = {
      fromInclusive: range.comparisonFromInclusive,
      toExclusive: range.comparisonToExclusive,
    };
    const [
      current,
      previous,
      totalOrders,
      previousTotalOrders,
      trend,
      orderStatus,
      paymentMethods,
      topProducts,
      lowStockRows,
      branch,
    ] = await Promise.all([
      this.repository.metrics(range, scope),
      this.repository.metrics(previousRange, scope),
      this.repository.totalOrders(range, scope),
      this.repository.totalOrders(previousRange, scope),
      this.repository.revenueTrend(
        range,
        scope,
        query.groupBy ?? DashboardGroupBy.DAY,
      ),
      this.repository.orderStatus(range, scope),
      this.repository.paymentMethods(range, scope),
      this.repository.topProducts(range, scope),
      this.repository.lowStock(scope),
      this.repository.findBranch(scope.branchId),
    ]);
    const currentAverage =
      current.completedOrders === 0
        ? 0
        : current.revenue / current.completedOrders;
    const previousAverage =
      previous.completedOrders === 0
        ? 0
        : previous.revenue / previous.completedOrders;
    const statusByKey = new Map(
      orderStatus.map((item) => [item.status, item.count]),
    );
    const paymentByKey = new Map(
      paymentMethods.map((item) => [item.method, item.count]),
    );
    const lowStock = lowStockRows.map((stock) => ({
      ...stock,
      state:
        stock.quantity === 0
          ? ('OUT_OF_STOCK' as const)
          : ('LOW_STOCK' as const),
    }));
    const conditional =
      scope.mode === 'GLOBAL'
        ? {
            branchPerformance: await this.repository.branchPerformance(range),
          }
        : {
            weeklyPerformance: await this.repository.weeklyPerformance(
              range,
              scope,
            ),
            todayOperations: await this.operationsToday(scope),
          };

    return {
      scope: { mode: scope.mode, branch },
      period: {
        from: range.from,
        to: range.to,
        timezone: ANALYTICS_TIMEZONE,
        preset: range.preset,
      },
      comparisonPeriod: {
        from: range.comparisonFrom,
        to: range.comparisonTo,
        timezone: ANALYTICS_TIMEZONE,
        preset: null,
      },
      kpis: {
        completedRevenue: this.metric(current.revenue, previous.revenue),
        totalOrders: this.metric(totalOrders, previousTotalOrders),
        soldQuantity: this.metric(current.soldQuantity, previous.soldQuantity),
        averageOrderValue: this.metric(currentAverage, previousAverage),
      },
      revenueTrend: trend,
      orderStatus: Object.values(OrderStatus).map((status) => ({
        status,
        count: statusByKey.get(status) ?? 0,
      })),
      paymentMethods: Object.values(PaymentMethod).map((method) => ({
        method,
        count: paymentByKey.get(method) ?? 0,
      })),
      topProducts,
      lowStock,
      ...conditional,
    };
  }

  private metric(current: number, previous: number): DashboardMetricDto {
    return {
      value: Math.round(current * 100) / 100,
      previousValue: Math.round(previous * 100) / 100,
      changePercent: percentageChange(current, previous),
    };
  }

  private async operationsToday(
    scope: ReturnType<typeof resolveAnalyticsScope>,
  ) {
    const snapshotAt = new Date();
    const result = await this.repository.todayOperations(scope, snapshotAt);
    const denominator = result.completedToday + result.cancelledToday;
    return {
      ...result,
      snapshotAt: snapshotAt.toISOString(),
      completionRate:
        denominator === 0
          ? 0
          : Math.round((result.completedToday / denominator) * 10_000) / 100,
    };
  }
}
