import { ProductsRepository } from './products.repository';

describe('ProductsRepository variant preview', () => {
  const product = { findUnique: jest.fn() };
  const repository = new ProductsRepository({ product } as never);

  beforeEach(() => jest.clearAllMocks());

  it('builds a deterministic one-option matrix and marks existing combinations', async () => {
    product.findUnique.mockResolvedValue({
      options: [
        {
          id: 'option-cover',
          name: 'Hình thức bìa',
          code: 'COVER',
          values: [
            { id: 'soft', label: 'Bìa mềm', value: 'SOFTCOVER' },
            { id: 'hard', label: 'Bìa cứng', value: 'HARDCOVER' },
          ],
        },
      ],
      variants: [{ combinationKey: 'COVER=SOFTCOVER' }],
    });

    await expect(repository.generatePreview('product')).resolves.toEqual({
      count: 2,
      limit: 200,
      combinations: [
        {
          label: 'Hình thức bìa: Bìa mềm',
          combinationKey: 'COVER=SOFTCOVER',
          optionValueIds: ['soft'],
          exists: true,
        },
        {
          label: 'Hình thức bìa: Bìa cứng',
          combinationKey: 'COVER=HARDCOVER',
          optionValueIds: ['hard'],
          exists: false,
        },
      ],
    });
  });

  it('builds the exact six-row FO-024 Cartesian matrix', async () => {
    product.findUnique.mockResolvedValue({
      options: [
        {
          id: 'ink',
          name: 'Màu mực',
          code: 'INK_COLOR',
          values: [
            { id: 'blue', label: 'Xanh', value: 'BLUE' },
            { id: 'red', label: 'Đỏ', value: 'RED' },
            { id: 'black', label: 'Đen', value: 'BLACK' },
          ],
        },
        {
          id: 'pack',
          name: 'Quy cách',
          code: 'PACK_SIZE',
          values: [
            { id: '10', label: '10 cây', value: 'PACK_10' },
            { id: '20', label: '20 cây', value: 'PACK_20' },
          ],
        },
      ],
      variants: [],
    });
    const result = await repository.generatePreview('product');
    expect(result?.count).toBe(6);
    expect(result?.combinations).toHaveLength(6);
    expect(result?.combinations[1]).toMatchObject({
      combinationKey: 'INK_COLOR=BLUE|PACK_SIZE=PACK_20',
      optionValueIds: ['blue', '20'],
    });
  });

  it('rejects a matrix larger than the server safety limit', async () => {
    product.findUnique.mockResolvedValue({
      options: Array.from({ length: 3 }, (_, optionIndex) => ({
        id: `option-${optionIndex}`,
        name: `Option ${optionIndex}`,
        code: `OPTION_${optionIndex}`,
        values: Array.from({ length: 6 }, (_, valueIndex) => ({
          id: `${optionIndex}-${valueIndex}`,
          label: `${valueIndex}`,
          value: `VALUE_${valueIndex}`,
        })),
      })),
      variants: [],
    });
    await expect(repository.generatePreview('product')).rejects.toMatchObject({
      code: 'PRODUCT_VARIANT_MATRIX_TOO_LARGE',
      details: { count: 216, limit: 200 },
    });
  });
});
