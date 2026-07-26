import { ProductsRepository } from './products.repository';
import { ProductOptionPresentationType } from '@/generated/prisma/client';

describe('ProductsRepository primary category', () => {
  const category = { count: jest.fn() };
  const author = { count: jest.fn() };
  const supplier = { count: jest.fn() };
  const publisher = { count: jest.fn() };
  const productAttribute = { findMany: jest.fn() };
  const tx = { category, author, supplier, publisher, productAttribute };
  const repository = new ProductsRepository({} as never);
  const categoryA = '01J00000000000000000000001';
  const categoryB = '01J00000000000000000000002';

  beforeEach(() => {
    jest.clearAllMocks();
    category.count.mockImplementation(({ where }) =>
      Promise.resolve(where.id.in.length),
    );
    author.count.mockResolvedValue(0);
    productAttribute.findMany.mockResolvedValue([]);
  });

  it('accepts a selected primary category', async () => {
    await expect(
      repository['prepareProductInput'](tx as never, {
        name: 'Sản phẩm',
        categoryIds: [categoryA, categoryB],
        primaryCategoryId: categoryB,
        authorIds: [],
        attributeValues: [],
      }),
    ).resolves.toMatchObject({
      categoryIds: [categoryA, categoryB],
      primaryCategoryId: categoryB,
    });
  });

  it('rejects categories without a primary category', async () => {
    await expect(
      repository['prepareProductInput'](tx as never, {
        name: 'Sản phẩm',
        categoryIds: [categoryA],
        primaryCategoryId: null,
        authorIds: [],
        attributeValues: [],
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_PRIMARY_CATEGORY_REQUIRED' });
  });

  it('rejects a primary category outside the selected categories', async () => {
    await expect(
      repository['prepareProductInput'](tx as never, {
        name: 'Sản phẩm',
        categoryIds: [categoryA],
        primaryCategoryId: categoryB,
        authorIds: [],
        attributeValues: [],
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_PRIMARY_CATEGORY_INVALID' });
  });

  it('preserves the stored primary on unrelated updates', async () => {
    await expect(
      repository['prepareProductInput'](
        tx as never,
        { shortDescription: 'Mới' },
        {
          name: 'Sản phẩm',
          description: null,
          shortDescription: null,
          supplier: null,
          publisher: null,
          releaseDate: null,
          categories: [
            { category: { id: categoryA, name: 'A' }, isPrimary: true },
          ],
          authors: [],
        } as never,
      ),
    ).resolves.toMatchObject({ primaryCategoryId: categoryA });
  });
});

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

describe('ProductsRepository option presentation', () => {
  const productOption = {
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const productOptionValue = {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const tx = { productOption, productOptionValue };
  const prisma = {
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const repository = new ProductsRepository(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects switching to COLOR while an existing value has no color', async () => {
    productOption.findFirst.mockResolvedValue({
      id: 'option',
      code: 'COVER',
      values: [{ colorCode: null }],
      _count: { links: 0 },
    });

    await expect(
      repository.updateOption('product', 'option', {
        presentationType: ProductOptionPresentationType.COLOR,
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_OPTION_COLOR_REQUIRED' });
    expect(productOption.update).not.toHaveBeenCalled();
  });

  it('requires color when adding a value to a COLOR option', async () => {
    productOption.findFirst.mockResolvedValue({
      id: 'option',
      presentationType: ProductOptionPresentationType.COLOR,
    });

    await expect(
      repository.createOptionValue('product', 'option', {
        label: 'Xanh',
        value: 'BLUE',
        colorCode: null,
      }),
    ).rejects.toMatchObject({ code: 'PRODUCT_OPTION_COLOR_REQUIRED' });
    expect(productOptionValue.create).not.toHaveBeenCalled();
  });

  it('preserves hidden color data when updating a non-color field', async () => {
    productOptionValue.findFirst.mockResolvedValue({
      id: 'value',
      value: 'BLUE',
      colorCode: '#2563EB',
      option: { presentationType: ProductOptionPresentationType.TEXT },
      _count: { variantLinks: 0 },
    });
    productOptionValue.update.mockResolvedValue({ id: 'value' });

    await repository.updateOptionValue('product', 'option', 'value', {
      label: 'Xanh mới',
    });

    expect(productOptionValue.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { label: 'Xanh mới' } }),
    );
  });
});
