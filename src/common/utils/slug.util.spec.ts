import { toSlug } from './slug.util';

describe('toSlug', () => {
  it.each([
    ['Văn học', 'van-hoc'],
    ['Tiểu sử - Hồi ký', 'tieu-su-hoi-ky'],
    ['  Kỹ Năng Sống  ', 'ky-nang-song'],
    ['Đồng dao & thơ', 'dong-dao-tho'],
  ])('normalizes %s', (value, expected) => {
    expect(toSlug(value)).toBe(expected);
  });

  it('returns an empty slug when the name has no supported characters', () => {
    expect(toSlug('---')).toBe('');
  });
});
