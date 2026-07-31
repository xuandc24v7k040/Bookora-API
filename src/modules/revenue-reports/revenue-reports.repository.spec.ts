import { RevenueReportsRepository } from './revenue-reports.repository';
import { RevenuePaymentMethod } from './dto';

describe('RevenueReportsRepository summary', () => {
  it('calculates completion rate from scoped terminal outcomes', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        completedRevenue: 100,
        completedOrders: 1n,
        soldQuantity: 2n,
        merchandiseRevenue: 90,
        shippingRevenue: 10,
        completionRate: 50,
      },
    ]);
    const repository = new RevenueReportsRepository({
      $queryRaw: queryRaw,
    } as never);

    const result = await repository.summary(
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
      RevenuePaymentMethod.COD,
    );

    const sql = queryRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    const source = sql.strings.join('?');

    expect(source).toContain(`o."status" IN ('COMPLETED', 'CANCELLED')`);
    expect(source).toContain(`h."to_status" = o."status"`);
    expect(source).toContain(`NULLIF(COUNT(*), 0)`);
    expect(sql.values).toContain('branch-1');
    expect(sql.values).toContain(RevenuePaymentMethod.COD);
    expect(result.completionRate).toBe(50);
  });

  it('returns a zero completion rate for an empty result', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const repository = new RevenueReportsRepository({
      $queryRaw: queryRaw,
    } as never);

    const result = await repository.summary(
      {
        from: '2026-07-01',
        to: '2026-07-01',
        fromInclusive: new Date('2026-06-30T17:00:00Z'),
        toExclusive: new Date('2026-07-01T17:00:00Z'),
        comparisonFrom: '2026-06-30',
        comparisonTo: '2026-06-30',
        comparisonFromInclusive: new Date('2026-06-29T17:00:00Z'),
        comparisonToExclusive: new Date('2026-06-30T17:00:00Z'),
        days: 1,
        preset: '7D',
      },
      { mode: 'GLOBAL', branchId: null, branchIds: null },
      RevenuePaymentMethod.ALL,
    );

    expect(result.completionRate).toBe(0);
  });
});
