import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import type { AnalyticsDateRange } from '@/modules/analytics/analytics-date-range';
import type { AnalyticsScope } from '@/modules/analytics/analytics-scope';
import { RevenueGroupBy, RevenuePaymentMethod, RevenueSortOrder } from './dto';

interface SummaryRow {
  completedRevenue: Prisma.Decimal;
  completedOrders: bigint;
  soldQuantity: bigint;
  merchandiseRevenue: Prisma.Decimal;
  shippingRevenue: Prisma.Decimal;
  completionRate: Prisma.Decimal;
}

interface BucketRow {
  key: Date;
  bucketTo: Date;
  completedOrders: bigint;
  soldQuantity: bigint;
  merchandiseRevenue: Prisma.Decimal;
  shippingRevenue: Prisma.Decimal;
  totalRevenue: Prisma.Decimal;
}

interface BranchRow {
  branchId: string;
  branchCode: string;
  branchName: string;
  isActive: boolean;
  completedOrders: bigint;
  soldQuantity: bigint;
  totalRevenue: Prisma.Decimal;
}

function branchSql(scope: AnalyticsScope): Prisma.Sql {
  return scope.branchIds === null
    ? Prisma.empty
    : Prisma.sql`AND o."branch_id" IN (${Prisma.join(scope.branchIds)})`;
}

function paymentSql(payment: RevenuePaymentMethod): Prisma.Sql {
  return payment === RevenuePaymentMethod.ALL
    ? Prisma.empty
    : Prisma.sql`AND p."method" = ${payment}::"PaymentMethod"`;
}

function grouping(groupBy: RevenueGroupBy): {
  truncate: Prisma.Sql;
  step: Prisma.Sql;
} {
  if (groupBy === RevenueGroupBy.WEEK) {
    return {
      truncate: Prisma.sql`date_trunc('week', `,
      step: Prisma.sql`interval '1 week'`,
    };
  }
  if (groupBy === RevenueGroupBy.MONTH) {
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

function completedCte(
  range: AnalyticsDateRange,
  scope: AnalyticsScope,
  payment: RevenuePaymentMethod,
): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT o."id", o."branch_id", o."subtotal_amount",
      o."shipping_fee", o."total_amount", h."created_at" AS "completed_at"
    FROM "orders" o
    JOIN "order_status_histories" h ON h."order_id" = o."id"
    JOIN "payments" p ON p."order_id" = o."id"
    WHERE o."status" = 'COMPLETED'
      AND h."event_type" = 'STATUS_CHANGED'
      AND h."to_status" = 'COMPLETED'
      AND h."created_at" >= ${range.fromInclusive}
      AND h."created_at" < ${range.toExclusive}
      ${branchSql(scope)}
      ${paymentSql(payment)}
  `;
}

function terminalOutcomesCte(
  range: AnalyticsDateRange,
  scope: AnalyticsScope,
  payment: RevenuePaymentMethod,
): Prisma.Sql {
  return Prisma.sql`
    SELECT DISTINCT o."id", o."status"
    FROM "orders" o
    JOIN "order_status_histories" h ON h."order_id" = o."id"
    JOIN "payments" p ON p."order_id" = o."id"
    WHERE o."status" IN ('COMPLETED', 'CANCELLED')
      AND h."event_type" = 'STATUS_CHANGED'
      AND h."to_status" = o."status"
      AND h."created_at" >= ${range.fromInclusive}
      AND h."created_at" < ${range.toExclusive}
      ${branchSql(scope)}
      ${paymentSql(payment)}
  `;
}

function bucketQueryParts(
  range: AnalyticsDateRange,
  groupBy: RevenueGroupBy,
): { series: Prisma.Sql; bucketExpression: Prisma.Sql } {
  const { truncate, step } = grouping(groupBy);
  const start = Prisma.sql`${truncate}${range.from}::date)`;
  const end = Prisma.sql`${truncate}${range.to}::date)`;
  return {
    series: Prisma.sql`generate_series(${start}, ${end}, ${step})`,
    bucketExpression: Prisma.sql`${truncate}(c."completed_at" AT TIME ZONE 'Asia/Ho_Chi_Minh'))`,
  };
}

@Injectable()
export class RevenueReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    range: AnalyticsDateRange,
    scope: AnalyticsScope,
    payment: RevenuePaymentMethod,
  ) {
    const rows = await this.prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
      WITH completed AS (${completedCte(range, scope, payment)}),
      terminal_outcomes AS (${terminalOutcomesCte(range, scope, payment)}),
      item_totals AS (
        SELECT oi."order_id", SUM(oi."quantity")::bigint AS "sold_quantity"
        FROM "order_items" oi
        JOIN completed c ON c."id" = oi."order_id"
        GROUP BY oi."order_id"
      )
      SELECT
        COALESCE(SUM(c."total_amount"), 0) AS "completedRevenue",
        COUNT(*)::bigint AS "completedOrders",
        COALESCE(SUM(i."sold_quantity"), 0)::bigint AS "soldQuantity",
        COALESCE(SUM(c."subtotal_amount"), 0) AS "merchandiseRevenue",
        COALESCE(SUM(c."shipping_fee"), 0) AS "shippingRevenue",
        COALESCE((
          SELECT ROUND(
            COUNT(*) FILTER (WHERE t."status" = 'COMPLETED')::numeric
              / NULLIF(COUNT(*), 0) * 100,
            2
          )
          FROM terminal_outcomes t
        ), 0) AS "completionRate"
      FROM completed c
      LEFT JOIN item_totals i ON i."order_id" = c."id"
    `);
    const row = rows[0];
    return {
      completedRevenue: Number(row?.completedRevenue ?? 0),
      completedOrders: Number(row?.completedOrders ?? 0),
      soldQuantity: Number(row?.soldQuantity ?? 0),
      merchandiseRevenue: Number(row?.merchandiseRevenue ?? 0),
      shippingRevenue: Number(row?.shippingRevenue ?? 0),
      completionRate: Number(row?.completionRate ?? 0),
    };
  }

  async buckets(
    range: AnalyticsDateRange,
    scope: AnalyticsScope,
    payment: RevenuePaymentMethod,
    groupBy: RevenueGroupBy,
    options?: {
      page: number;
      limit: number;
      sortOrder: RevenueSortOrder;
    },
  ): Promise<{ items: BucketRow[]; total: number }> {
    const { series, bucketExpression } = bucketQueryParts(range, groupBy);
    const { step } = grouping(groupBy);
    const direction =
      options?.sortOrder === RevenueSortOrder.DESC
        ? Prisma.sql`DESC`
        : Prisma.sql`ASC`;
    const pagination = options
      ? Prisma.sql`LIMIT ${options.limit} OFFSET ${(options.page - 1) * options.limit}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<BucketRow[]>(Prisma.sql`
      WITH completed AS (${completedCte(range, scope, payment)}),
      item_totals AS (
        SELECT oi."order_id", SUM(oi."quantity")::bigint AS "sold_quantity"
        FROM "order_items" oi
        JOIN completed c ON c."id" = oi."order_id"
        GROUP BY oi."order_id"
      ),
      aggregated AS (
        SELECT
          ${bucketExpression} AS "key",
          COUNT(*)::bigint AS "completedOrders",
          COALESCE(SUM(i."sold_quantity"), 0)::bigint AS "soldQuantity",
          COALESCE(SUM(c."subtotal_amount"), 0) AS "merchandiseRevenue",
          COALESCE(SUM(c."shipping_fee"), 0) AS "shippingRevenue",
          COALESCE(SUM(c."total_amount"), 0) AS "totalRevenue"
        FROM completed c
        LEFT JOIN item_totals i ON i."order_id" = c."id"
        GROUP BY 1
      )
      SELECT
        s."key",
        (s."key" + ${step} - interval '1 day')::date AS "bucketTo",
        COALESCE(a."completedOrders", 0)::bigint AS "completedOrders",
        COALESCE(a."soldQuantity", 0)::bigint AS "soldQuantity",
        COALESCE(a."merchandiseRevenue", 0) AS "merchandiseRevenue",
        COALESCE(a."shippingRevenue", 0) AS "shippingRevenue",
        COALESCE(a."totalRevenue", 0) AS "totalRevenue"
      FROM ${series} AS s("key")
      LEFT JOIN aggregated a ON a."key" = s."key"
      ORDER BY s."key" ${direction}
      ${pagination}
    `);
    const countRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM ${series} AS s("key")`,
    );
    return { items: rows, total: Number(countRows[0]?.count ?? 0) };
  }

  async branches(range: AnalyticsDateRange, payment: RevenuePaymentMethod) {
    const scope: AnalyticsScope = {
      mode: 'GLOBAL',
      branchIds: null,
      branchId: null,
    };
    const rows = await this.prisma.$queryRaw<BranchRow[]>(Prisma.sql`
      WITH completed AS (${completedCte(range, scope, payment)}),
      item_totals AS (
        SELECT oi."order_id", SUM(oi."quantity")::bigint AS "sold_quantity"
        FROM "order_items" oi
        JOIN completed c ON c."id" = oi."order_id"
        GROUP BY oi."order_id"
      )
      SELECT
        b."id" AS "branchId",
        b."code" AS "branchCode",
        b."name" AS "branchName",
        b."is_active" AS "isActive",
        COUNT(*)::bigint AS "completedOrders",
        COALESCE(SUM(i."sold_quantity"), 0)::bigint AS "soldQuantity",
        COALESCE(SUM(c."total_amount"), 0) AS "totalRevenue"
      FROM completed c
      JOIN "branches" b ON b."id" = c."branch_id"
      LEFT JOIN item_totals i ON i."order_id" = c."id"
      GROUP BY b."id", b."code", b."name", b."is_active"
      ORDER BY SUM(c."total_amount") DESC, b."id" ASC
    `);
    return rows.map((row) => ({
      ...row,
      completedOrders: Number(row.completedOrders),
      soldQuantity: Number(row.soldQuantity),
      totalRevenue: Number(row.totalRevenue),
    }));
  }

  findBranch(branchId: string | null) {
    if (!branchId) return null;
    return this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, code: true, name: true, isActive: true },
    });
  }
}
