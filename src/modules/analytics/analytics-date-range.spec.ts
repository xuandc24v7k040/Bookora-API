import { resolveAnalyticsDateRange } from './analytics-date-range';

describe('analytics date range', () => {
  it('resolves presets in Vietnam time with an equal non-overlapping comparison', () => {
    const range = resolveAnalyticsDateRange({
      preset: '7D',
      now: new Date('2026-07-30T03:00:00.000Z'),
    });
    expect(range).toMatchObject({
      from: '2026-07-24',
      to: '2026-07-30',
      comparisonFrom: '2026-07-17',
      comparisonTo: '2026-07-23',
      days: 7,
    });
    expect(range.toExclusive.toISOString()).toBe('2026-07-30T17:00:00.000Z');
    expect(range.comparisonToExclusive).toEqual(range.fromInclusive);
  });

  it('rejects reversed, incomplete, conflicting and overlong ranges', () => {
    expect(() =>
      resolveAnalyticsDateRange({ from: '2026-07-02', to: '2026-07-01' }),
    ).toThrow('Khoảng thời gian không hợp lệ');
    expect(() => resolveAnalyticsDateRange({ from: '2026-07-01' })).toThrow();
    expect(() =>
      resolveAnalyticsDateRange({
        preset: '30D',
        from: '2026-07-01',
        to: '2026-07-30',
      }),
    ).toThrow();
    expect(() =>
      resolveAnalyticsDateRange({
        from: '2025-01-01',
        to: '2026-07-30',
      }),
    ).toThrow('không được vượt quá một năm');
  });
});
