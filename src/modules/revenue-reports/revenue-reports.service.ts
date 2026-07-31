import { ForbiddenException, Injectable } from '@nestjs/common';
import { PaginatedResponseDto } from '@/common/dto';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { BranchContext } from '@/modules/authorization';
import {
  ANALYTICS_TIMEZONE,
  resolveAnalyticsDateRange,
} from '@/modules/analytics/analytics-date-range';
import { resolveAnalyticsScope } from '@/modules/analytics/analytics-scope';
import { CsvExportService } from './csv-export.service';
import {
  RevenueGroupBy,
  RevenuePaymentMethod,
  type RevenueReportQueryDto,
  type RevenueSummaryDto,
  type RevenueTableRowDto,
} from './dto';
import { RevenueReportsRepository } from './revenue-reports.repository';

@Injectable()
export class RevenueReportsService {
  constructor(
    private readonly repository: RevenueReportsRepository,
    private readonly csv: CsvExportService,
  ) {}

  async summary(
    actor: AuthenticatedUser,
    context: BranchContext,
    query: RevenueReportQueryDto,
  ): Promise<RevenueSummaryDto> {
    const { scope, range, branch } = await this.resolve(actor, context, query);
    const summary = await this.repository.summary(
      range,
      scope,
      query.paymentMethod,
    );
    const leadingBranch =
      actor.isSuperAdmin && scope.mode === 'GLOBAL'
        ? this.mapBranch(
            (await this.repository.branches(range, query.paymentMethod))[0],
          )
        : null;
    return {
      scope: { mode: scope.mode, branch },
      period: {
        from: range.from,
        to: range.to,
        timezone: ANALYTICS_TIMEZONE,
        preset: range.preset,
      },
      groupBy: query.groupBy,
      paymentMethod: query.paymentMethod,
      ...summary,
      leadingBranch,
      averageOrderValue:
        summary.completedOrders === 0
          ? 0
          : Math.round(
              (summary.completedRevenue / summary.completedOrders) * 100,
            ) / 100,
    };
  }

  async trend(
    actor: AuthenticatedUser,
    context: BranchContext,
    query: RevenueReportQueryDto,
  ) {
    const { scope, range } = await this.resolve(actor, context, query);
    const result = await this.repository.buckets(
      range,
      scope,
      query.paymentMethod,
      query.groupBy,
    );
    return {
      items: result.items.map((row) => this.mapBucket(row, query.groupBy)),
    };
  }

  async branches(
    actor: AuthenticatedUser,
    context: BranchContext,
    query: RevenueReportQueryDto,
  ) {
    const { scope, range } = await this.resolve(actor, context, query);
    if (!actor.isSuperAdmin || scope.mode !== 'GLOBAL') {
      throw new ForbiddenException({
        code: 'ANALYTICS_BRANCH_FORBIDDEN',
        message: 'Bạn không có quyền xem so sánh giữa các chi nhánh.',
      });
    }
    const items = await this.repository.branches(range, query.paymentMethod);
    return {
      items: items.map((row) => this.mapBranch(row)),
    };
  }

  async table(
    actor: AuthenticatedUser,
    context: BranchContext,
    query: RevenueReportQueryDto,
  ): Promise<PaginatedResponseDto<RevenueTableRowDto>> {
    const { scope, range } = await this.resolve(actor, context, query);
    const result = await this.repository.buckets(
      range,
      scope,
      query.paymentMethod,
      query.groupBy,
      {
        page: query.page,
        limit: query.limit,
        sortOrder: query.sortOrder,
      },
    );
    return new PaginatedResponseDto(
      result.items.map((row) => this.mapBucket(row, query.groupBy)),
      result.total,
      query.page,
      query.limit,
    );
  }

  async export(
    actor: AuthenticatedUser,
    context: BranchContext,
    query: RevenueReportQueryDto,
  ): Promise<{ file: Buffer; filename: string }> {
    const { scope, range, branch } = await this.resolve(actor, context, query);
    const result = await this.repository.buckets(
      range,
      scope,
      query.paymentMethod,
      query.groupBy,
    );
    const scopeSlug = branch?.code ?? 'all-branches';
    return {
      file: this.csv.build({
        rows: result.items.map((row) => this.mapBucket(row, query.groupBy)),
        branchName: branch?.name ?? 'Toàn hệ thống',
        paymentMethod:
          query.paymentMethod === RevenuePaymentMethod.ALL
            ? 'Tất cả'
            : query.paymentMethod,
      }),
      filename: `bookora-revenue_${range.from.replaceAll('-', '')}_${range.to.replaceAll('-', '')}_${scopeSlug}.csv`,
    };
  }

  private async resolve(
    actor: AuthenticatedUser,
    context: BranchContext,
    query: RevenueReportQueryDto,
  ) {
    const scope = resolveAnalyticsScope(actor, context);
    const range = resolveAnalyticsDateRange(query);
    const branch = await this.repository.findBranch(scope.branchId);
    return { scope, range, branch };
  }

  private mapBucket(
    row: {
      key: Date;
      bucketTo: Date;
      completedOrders: bigint;
      soldQuantity: bigint;
      merchandiseRevenue: { toString(): string };
      shippingRevenue: { toString(): string };
      totalRevenue: { toString(): string };
    },
    groupBy: RevenueGroupBy,
  ): RevenueTableRowDto {
    const from = this.dateValue(row.key);
    const to = this.dateValue(row.bucketTo);
    const completedOrders = Number(row.completedOrders);
    const totalRevenue = Number(row.totalRevenue);
    return {
      key: from,
      label: this.bucketLabel(from, to, groupBy),
      from,
      to,
      completedOrders,
      soldQuantity: Number(row.soldQuantity),
      merchandiseRevenue: Number(row.merchandiseRevenue),
      shippingRevenue: Number(row.shippingRevenue),
      totalRevenue,
      averageOrderValue:
        completedOrders === 0
          ? 0
          : Math.round((totalRevenue / completedOrders) * 100) / 100,
    };
  }

  private mapBranch(
    row:
      | {
          branchId: string;
          branchCode: string;
          branchName: string;
          isActive: boolean;
          completedOrders: number;
          soldQuantity: number;
          totalRevenue: number;
        }
      | undefined,
  ) {
    if (!row) return null;
    return {
      ...row,
      averageOrderValue:
        row.completedOrders === 0
          ? 0
          : Math.round((row.totalRevenue / row.completedOrders) * 100) / 100,
    };
  }

  private dateValue(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value);
  }

  private bucketLabel(
    from: string,
    to: string,
    groupBy: RevenueGroupBy,
  ): string {
    const format = (value: string) =>
      new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(`${value}T00:00:00Z`));
    if (groupBy === RevenueGroupBy.DAY) return format(from);
    if (groupBy === RevenueGroupBy.MONTH) {
      const [year, month] = from.split('-');
      return `Tháng ${month}/${year}`;
    }
    return `${format(from)} – ${format(to)}`;
  }
}
