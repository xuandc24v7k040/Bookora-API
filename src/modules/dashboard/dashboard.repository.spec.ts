import { DashboardRepository } from './dashboard.repository';
import { DashboardGroupBy } from './dto';

describe('DashboardRepository completed metrics', () => {
  it('uses raw COMPLETED history and parameterized branch scope', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValue([
        { revenue: 100, completedOrders: 1n, soldQuantity: 2n },
      ]);
    const repository = new DashboardRepository({
      $queryRaw: queryRaw,
    } as never);
    await repository.metrics(
      {
        fromInclusive: new Date('2026-07-01T00:00:00Z'),
        toExclusive: new Date('2026-08-01T00:00:00Z'),
      },
      { mode: 'BRANCH', branchId: 'branch-1', branchIds: ['branch-1'] },
    );
    const sql = queryRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    const source = sql.strings.join('?');
    expect(source).toContain(`o."status" = 'COMPLETED'`);
    expect(source).toContain(`h."to_status" = 'COMPLETED'`);
    expect(source).toContain(`h."created_at" >= ?`);
    expect(source).not.toContain('customer_confirmed_received_at');
    expect(sql.values).toContain('branch-1');
  });

  it('groups and zero-fills the revenue trend using the requested interval', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const repository = new DashboardRepository({
      $queryRaw: queryRaw,
    } as never);

    await repository.revenueTrend(
      {
        from: '2026-07-01',
        to: '2026-07-30',
        fromInclusive: new Date('2026-06-30T17:00:00Z'),
        toExclusive: new Date('2026-07-30T17:00:00Z'),
        comparisonFrom: '2026-06-01',
        comparisonTo: '2026-06-30',
        comparisonFromInclusive: new Date('2026-05-31T17:00:00Z'),
        comparisonToExclusive: new Date('2026-06-30T17:00:00Z'),
        days: 30,
        preset: '30D',
      },
      { mode: 'GLOBAL', branchId: null, branchIds: null },
      DashboardGroupBy.WEEK,
    );

    const sql = queryRaw.mock.calls[0][0] as { strings: string[] };
    const source = sql.strings.join('?');
    expect(source).toContain("date_trunc('week'");
    expect(source).toContain("interval '1 week'");
    expect(source).toContain('generate_series');
    expect(source).toContain('LEFT JOIN aggregated');
  });

  it('bounds dashboard product and low-stock rows', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const repository = new DashboardRepository({
      $queryRaw: queryRaw,
    } as never);
    const range = {
      from: '2026-07-01',
      to: '2026-07-30',
      fromInclusive: new Date('2026-06-30T17:00:00Z'),
      toExclusive: new Date('2026-07-30T17:00:00Z'),
      comparisonFrom: '2026-06-01',
      comparisonTo: '2026-06-30',
      comparisonFromInclusive: new Date('2026-05-31T17:00:00Z'),
      comparisonToExclusive: new Date('2026-06-30T17:00:00Z'),
      days: 30,
      preset: '30D' as const,
    };
    const scope = {
      mode: 'GLOBAL' as const,
      branchId: null,
      branchIds: null,
    };

    await repository.topProducts(range, scope);
    await repository.lowStock(scope);

    const topProductsSql = (
      queryRaw.mock.calls[0][0] as { strings: string[] }
    ).strings.join('?');
    const lowStockSql = (
      queryRaw.mock.calls[1][0] as { strings: string[] }
    ).strings.join('?');
    expect(topProductsSql).toContain('LIMIT 3');
    expect(lowStockSql).toContain('LIMIT 4');
  });

  it('zero-fills and bounds branch weekly performance to four buckets', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const repository = new DashboardRepository({
      $queryRaw: queryRaw,
    } as never);

    await repository.weeklyPerformance(
      {
        from: '2026-07-01',
        to: '2026-07-30',
        fromInclusive: new Date('2026-06-30T17:00:00Z'),
        toExclusive: new Date('2026-07-30T17:00:00Z'),
        comparisonFrom: '2026-06-01',
        comparisonTo: '2026-06-30',
        comparisonFromInclusive: new Date('2026-05-31T17:00:00Z'),
        comparisonToExclusive: new Date('2026-06-30T17:00:00Z'),
        days: 30,
        preset: '30D',
      },
      { mode: 'BRANCH', branchId: 'branch-1', branchIds: ['branch-1'] },
    );

    const sql = queryRaw.mock.calls[0][0] as { strings: string[] };
    const source = sql.strings.join('?');
    expect(source).toContain('generate_series');
    expect(source).toContain('recent_series');
    expect(source).toContain('LIMIT 4');
    expect(source).toContain('LEFT JOIN aggregated');
  });
});
