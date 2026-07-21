import {
  normalizeAttributeCode,
  normalizeMasterDataName,
  normalizeNullableText,
  startOfNextVietnamDate,
  startOfVietnamDate,
} from './master-data.util';
describe('master data utilities', () => {
  it('normalizes Vietnamese names and nullable values', () => {
    expect(normalizeMasterDataName('  Nhà   xuất bản Trẻ ')).toBe(
      'Nhà xuất bản Trẻ',
    );
    expect(normalizeNullableText('   ')).toBeNull();
  });
  it('normalizes attribute codes to uppercase snake case', () => {
    expect(normalizeAttributeCode(' kích thước ngòi ')).toBe('KICH_THUOC_NGOI');
  });
  it('builds inclusive Vietnam date bounds', () => {
    expect(startOfVietnamDate('2026-07-20').toISOString()).toBe(
      '2026-07-19T17:00:00.000Z',
    );
    expect(startOfNextVietnamDate('2026-07-20').toISOString()).toBe(
      '2026-07-20T17:00:00.000Z',
    );
  });
});
