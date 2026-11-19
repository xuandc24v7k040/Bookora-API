import {
  assertFlashPrice,
  flashDiscountPercent,
  flashPriceFromPercent,
  flashSaleStatus,
} from './flash-sale-pricing';

describe('Flash Sale canonical VND pricing', () => {
  it.each([
    [300000, 20, 240000],
    [2290000, 20, 1832000],
    [99999, 33.33, 66669],
    [5, 50, 3],
  ])('rounds %s at %s%% half up to %s', (catalog, percent, expected) => {
    expect(flashPriceFromPercent(catalog, percent)).toBe(expected);
  });
  it.each([0, -1, 100, 101, NaN, Infinity, 12.345])(
    'rejects invalid percentage %s',
    (value) => expect(() => flashPriceFromPercent(300000, value)).toThrow(),
  );
  it.each([0, -1, 300000, 300001, 1.5, Number.MAX_SAFE_INTEGER, NaN])(
    'rejects invalid canonical price %s',
    (value) => expect(() => assertFlashPrice(value, 300000)).toThrow(),
  );
  it('does not manufacture a discount when catalog is equal or lower', () => {
    expect(flashDiscountPercent(240000, 240000)).toBe(0);
    expect(flashDiscountPercent(230000, 240000)).toBe(0);
    expect(flashDiscountPercent(300000, 240000)).toBe(20);
  });
  it('rejects a percentage whose rounded price is zero or unchanged', () => {
    expect(() => flashPriceFromPercent(1, 99.99)).toThrow();
    expect(() => flashPriceFromPercent(1, 0.01)).toThrow();
  });
});
describe('Flash Sale backend clock boundaries', () => {
  const startAt = new Date('2026-11-18T05:00:00Z'),
    endAt = new Date('2026-11-18T06:00:00Z');
  it.each([
    ['2026-11-18T04:59:59.999Z', 'SCHEDULED'],
    ['2026-11-18T05:00:00Z', 'ACTIVE'],
    ['2026-11-18T05:59:59.999Z', 'ACTIVE'],
    ['2026-11-18T06:00:00Z', 'ENDED'],
  ])('%s yields %s', (now, status) =>
    expect(
      flashSaleStatus({ state: 'PUBLISHED', startAt, endAt }, new Date(now)),
    ).toBe(status),
  );
  it.each(['DRAFT', 'CANCELLED', 'STOPPED_EARLY'] as const)(
    'preserves control state %s',
    (state) =>
      expect(flashSaleStatus({ state, startAt, endAt }, startAt)).toBe(state),
  );
});
