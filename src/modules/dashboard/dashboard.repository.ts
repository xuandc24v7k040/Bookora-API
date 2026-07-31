import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import type { AnalyticsDateRange } from '@/modules/analytics/analytics-date-range';
import type { AnalyticsScope } from '@/modules/analytics/analytics-scope';
import { DashboardGroupBy } from './dto';

interface MetricRow {
  revenue: Prisma.Decimal | null;
  completedOrders: bigint;
  soldQuantity: bigint;
}

interface TotalOrdersRow {
  count: bigint;
}

interface TrendRow {
  key: Date;
  revenue: Prisma.Decimal;
  completedOrders: bigint;
}

interface StatusRow {
  status: OrderStatus;
  count: bigint;
}

interface PaymentRow {
  method: 'COD' | 'VNPAY';
  count: bigint;
}

interface TopProductRow {
  productId: string;
  productName: string;
  imageUrl: string | null;
  soldQuantity: bigint;
  revenue: Prisma.Decimal;
}

interface BranchPerformanceRow {
  branchId: string;
  branchName: string;
  isActive: boolean;
  revenue: Prisma.Decimal;
  completedOrders: bigint;
}

interface TodayOperationsRow {
  pendingOrders: bigint;
  completedToday: bigint;
  cancelledToday: bigint;
}

interface LowStockRow {
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  lowStockThreshold: number;
}

function branchSql(scope: AnalyticsScope, alias = 'o'): Prisma.Sql {
  return scope.branchIds === null
    ? Prisma.empty
    : Prisma.sql`AND ${Prisma.raw(alias)}."branch_id" IN (${Prisma.join(scope.branchIds)})`;
}

function completedSql(
  range: { fromInclusive: Date; toExclusive: Date },
  scope: AnalyticsScope,
): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT o."id", o."branch_id", o."subtotal_amount", o."shipping_fee",
      o."total_amount", h."created_at" AS "completed_at"
    FROM "orders" o
    JOIN "order_status_histories" h ON h."order_id" = o."id"
    WHERE o."status" = 'COMPLETED'
      AND h."event_type" = 'STATUS_CHANGED'
      AND h."to_status" = 'COMPLETED'
      AND h."created_at" >= ${range.fromInclusive}
      AND h."created_at" < ${range.toExclusive}
      ${branchSql(scope)}
  `;
}

function trendGrouping(groupBy: DashboardGroupBy): {
  truncate: Prisma.Sql;
  step: Prisma.Sql;
} {
  if (groupBy === DashboardGroupBy.WEEK) {
    return {
      truncate: Prisma.sql`date_trunc('week', `,
      step: Prisma.sql`interval '1 week'`,
    };
  }
  if (groupBy === DashboardGroupBy.MONTH) {
    return {
      truncate: Prisma.sql`date_trunc('month', `,
      step: Prisma.sql`interval '1 month'`,
    };
  }
  return {
    truncate: Prisma.sql`date_trunc('day', `,
    step: Prisma.sql`interval '1 day'`,
  };
}

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async metrics(
    range: { fromInclusive: Date; toExclusive: Date },
    scope: AnalyticsScope,
  ): Promise<{
    revenue: number;
    completedOrders: number;
    soldQuantity: number;
  }> {
    const rows = await this.prisma.$queryRaw<MetricRow[]>(Prisma.sql`
      WITH completed AS (${completedSql(range, scope)})
      SELECT
        COALESCE(SUM(c."total_amount"), 0) AS "revenue",
        COUNT(*)::bigint AS "completedOrders",
        COALESCE((
          SELECT SUM(oi."quantity")::bigint
          FROM "order_items" oi
          JOIN completed ci ON ci."id" = oi."order_id"
        ), 0)::bigint AS "soldQuantity"
      FROM completed c
    `);
    const row = rows[0];
    return {
      revenue: Number(row?.revenue ?? 0),
      completedOrders: Number(row?.completedOrders ?? 0),
      soldQuantity: Number(row?.soldQuantity ?? 0),
    };
  }

  async totalOrders(
    range: { fromInclusive: Date; toExclusive: Date },
    scope: AnalyticsScope,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<TotalOrdersRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "orders" o
      WHERE o."placed_at" >= ${range.fromInclusive}
        AND o."placed_at" < ${range.toExclusive}
        ${branchSql(scope)}
    `);
    return Number(rows[0]?.count ?? 0);
  }

  async revenueTrend(
    range: AnalyticsDateRange,
    scope: AnalyticsScope,
    groupBy: DashboardGroupBy = DashboardGroupBy.DAY,
  ) {
    const { truncate, step } = trendGrouping(groupBy);
    const seriesStart = Prisma.sql`${truncate}${range.from}::date)`;
    const seriesEnd = Prisma.sql`${truncate}${range.to}::date)`;
    const bucketExpression = Prisma.sql`${truncate}(c."completed_at" AT TIME ZONE 'Asia/Ho_Chi_Minh'))`;
    const rows = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      WITH completed AS (${completedSql(range, scope)}),
      series AS (
        SELECT generate_series(
          ${seriesStart},
          ${seriesEnd},
          ${step}
        )::date AS "key"
      ),
      aggregated AS (
        SELECT
          ${bucketExpression}::date AS "key",
          COALESCE(SUM(c."total_amount"), 0) AS "revenue",
          COUNT(*)::bigint AS "completedOrders"
        FROM completed c
        GROUP BY 1
      )
      SELECT
        s."key",
        COALESCE(a."revenue", 0) AS "revenue",
        COALESCE(a."completedOrders", 0)::bigint AS "completedOrders"
      FROM series s
      LEFT JOIN aggregated a ON a."key" = s."key"
      ORDER BY s."key" ASC
    `);
    return rows.map((row) => ({
      key: row.key.toISOString().slice(0, 10),
      revenue: Number(row.revenue),
      completedOrders: Number(row.completedOrders),
    }));
  }

  async orderStatus(range: AnalyticsDateRange, scope: AnalyticsScope) {
    const rows = await this.prisma.$queryRaw<StatusRow[]>(Prisma.sql`
      SELECT o."status", COUNT(*)::bigint AS "count"
      FROM "orders" o
      WHERE o."placed_at" >= ${range.fromInclusive}
        AND o."placed_at" < ${range.toExclusive}
        ${branchSql(scope)}
      GROUP BY o."status"
      ORDER BY o."status" ASC
    `);
    return rows.map((row) => ({
      status: row.status,
      count: Number(row.count),
    }));
  }

  async paymentMethods(range: AnalyticsDateRange, scope: AnalyticsScope) {
    const rows = await this.prisma.$queryRaw<PaymentRow[]>(Prisma.sql`
      SELECT p."method", COUNT(*)::bigint AS "count"
      FROM "orders" o
      JOIN "payments" p ON p."order_id" = o."id"
      WHERE o."placed_at" >= ${range.fromInclusive}
        AND o."placed_at" < ${range.toExclusive}
        ${branchSql(scope)}
      GROUP BY p."method"
      ORDER BY p."method" ASC
    `);
    return rows.map((row) => ({
      method: row.method,
      count: Number(row.count),
    }));
  }

  async topProducts(range: AnalyticsDateRange, scope: AnalyticsScope) {
    const rows = await this.prisma.$queryRaw<TopProductRow[]>(Prisma.sql`
      WITH completed AS (${completedSql(range, scope)})
      SELECT
        COALESCE(oi."product_id", oi."product_slug") AS "productId",
        oi."product_name" AS "productName",
        MIN(oi."image_url") AS "imageUrl",
        SUM(oi."quantity")::bigint AS "soldQuantity",
        SUM(oi."line_total") AS "revenue"
      FROM completed c
      JOIN "order_items" oi ON oi."order_id" = c."id"
      GROUP BY COALESCE(oi."product_id", oi."product_slug"), oi."product_name"
      ORDER BY SUM(oi."quantity") DESC, SUM(oi."line_total") DESC,
        COALESCE(oi."product_id", oi."product_slug") ASC
      LIMIT 3
    `);
    return rows.map((row) => ({
      ...row,
      variantLabel: null,
      soldQuantity: Number(row.soldQuantity),
      revenue: Number(row.revenue),
    }));
  }

  async lowStock(scope: AnalyticsScope) {
    const scopeSql =
      scope.branchIds === null
        ? Prisma.empty
        : Prisma.sql`AND s."branch_id" IN (${Prisma.join(scope.branchIds)})`;
    return this.prisma.$queryRaw<LowStockRow[]>(Prisma.sql`
      SELECT
        s."branch_id" AS "branchId",
        b."name" AS "branchName",
        p."id" AS "productId",
        p."name" AS "productName",
        v."id" AS "variantId",
        CASE WHEN EXISTS (
          SELECT 1 FROM "product_options" po WHERE po."product_id" = p."id"
        ) THEN v."name" ELSE NULL END AS "variantLabel",
        COALESCE(
          (SELECT pm."url" FROM "product_media" pm
            WHERE pm."variant_id" = v."id" AND pm."is_primary" = true
            ORDER BY pm."sort_order", pm."id" LIMIT 1),
          (SELECT pm."url" FROM "product_media" pm
            WHERE pm."product_id" = p."id" AND pm."variant_id" IS NULL
              AND pm."is_primary" = true
            ORDER BY pm."sort_order", pm."id" LIMIT 1)
        ) AS "imageUrl",
        s."quantity",
        s."low_stock_threshold" AS "lowStockThreshold"
      FROM "branch_product_stocks" s
      JOIN "branches" b ON b."id" = s."branch_id"
      JOIN "product_variants" v ON v."id" = s."variant_id"
      JOIN "products" p ON p."id" = v."product_id"
      WHERE s."quantity" <= s."low_stock_threshold"
        ${scopeSql}
      ORDER BY
        CASE WHEN s."quantity" = 0 THEN 0 ELSE 1 END,
        s."quantity" ASC,
        s."branch_id" ASC,
        s."variant_id" ASC
      LIMIT 4
    `);
  }

  async branchPerformance(range: AnalyticsDateRange) {
    const globalScope: AnalyticsScope = {
      mode: 'GLOBAL',
      branchIds: null,
      branchId: null,
    };
    const rows = await this.prisma.$queryRaw<BranchPerformanceRow[]>(Prisma.sql`
      WITH completed AS (${completedSql(range, globalScope)})
      SELECT
        b."id" AS "branchId",
        b."name" AS "branchName",
        b."is_active" AS "isActive",
        COALESCE(SUM(c."total_amount"), 0) AS "revenue",
        COUNT(*)::bigint AS "completedOrders"
      FROM completed c
      JOIN "branches" b ON b."id" = c."branch_id"
      GROUP BY b."id", b."name", b."is_active"
      ORDER BY SUM(c."total_amount") DESC, b."id" ASC
    `);
    return rows.map((row) => ({
      ...row,
      revenue: Number(row.revenue),
      completedOrders: Number(row.completedOrders),
    }));
  }

  async weeklyPerformance(range: AnalyticsDateRange, scope: AnalyticsScope) {
    const rows = await this.prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      WITH completed AS (${completedSql(range, scope)}),
      series AS (
        SELECT generate_series(
          date_trunc('week', ${range.from}::date),
          date_trunc('week', ${range.to}::date),
          interval '1 week'
        )::date AS "key"
      ),
      recent_series AS (
        SELECT "key"
        FROM series
        ORDER BY "key" DESC
        LIMIT 4
      ),
      aggregated AS (
        SELECT
          date_trunc(
            'week',
            c."completed_at" AT TIME ZONE 'Asia/Ho_Chi_Minh'
          )::date AS "key",
          COALESCE(SUM(c."total_amount"), 0) AS "revenue",
          COUNT(*)::bigint AS "completedOrders"
        FROM completed c
        GROUP BY 1
      )
      SELECT
        s."key",
        COALESCE(a."revenue", 0) AS "revenue",
        COALESCE(a."completedOrders", 0)::bigint AS "completedOrders"
      FROM recent_series s
      LEFT JOIN aggregated a ON a."key" = s."key"
      ORDER BY s."key" ASC
    `);
    return rows.map((row) => ({
      key: row.key.toISOString().slice(0, 10),
      label: `Tuần ${row.key.toISOString().slice(0, 10)}`,
      revenue: Number(row.revenue),
      completedOrders: Number(row.completedOrders),
    }));
  }

  async todayOperations(scope: AnalyticsScope, now: Date) {
    const vietnamToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const from = new Date(`${vietnamToday}T00:00:00+07:00`);
    const to = new Date(from.getTime() + 86_400_000);
    const rows = await this.prisma.$queryRaw<TodayOperationsRow[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM "orders" o
          WHERE o."status" IN ('PENDING', 'CONFIRMED', 'PACKING')
          ${branchSql(scope)})::bigint AS "pendingOrders",
        (SELECT COUNT(DISTINCT o."id") FROM "orders" o
          JOIN "order_status_histories" h ON h."order_id" = o."id"
          WHERE h."event_type" = 'STATUS_CHANGED' AND h."to_status" = 'COMPLETED'
            AND h."created_at" >= ${from} AND h."created_at" < ${to}
            ${branchSql(scope)})::bigint AS "completedToday",
        (SELECT COUNT(DISTINCT o."id") FROM "orders" o
          JOIN "order_status_histories" h ON h."order_id" = o."id"
          WHERE h."event_type" = 'STATUS_CHANGED' AND h."to_status" = 'CANCELLED'
            AND h."created_at" >= ${from} AND h."created_at" < ${to}
            ${branchSql(scope)})::bigint AS "cancelledToday"
    `);
    const row = rows[0];
    return {
      pendingOrders: Number(row?.pendingOrders ?? 0),
      completedToday: Number(row?.completedToday ?? 0),
      cancelledToday: Number(row?.cancelledToday ?? 0),
    };
  }

  findBranch(branchId: string | null) {
    if (!branchId) return null;
    return this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, code: true, name: true, isActive: true },
    });
  }
}
