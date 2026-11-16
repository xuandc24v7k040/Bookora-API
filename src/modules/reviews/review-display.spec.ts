import { purchasedVariantLabel } from './review-display';

describe('purchase review snapshot', () => {
  it('omits SIMPLE and unavailable legacy options', () => {
    expect(purchasedVariantLabel([])).toBeNull();
    expect(purchasedVariantLabel(undefined)).toBeNull();
    expect(purchasedVariantLabel([{ value: 'Mặc định' }])).toBeNull();
  });

  it.each([1, 2, 3, 5])(
    'preserves all %s groups in historical order',
    (count) => {
      const options = Array.from({ length: count }, (_, index) => ({
        name: `Nhóm ${index}`,
        value: `Giá trị cũ ${index}`,
      }));
      expect(purchasedVariantLabel(options)).toBe(
        options.map((option) => `${option.name}: ${option.value}`).join(' · '),
      );
    },
  );
});
