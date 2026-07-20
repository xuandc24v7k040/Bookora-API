import { CategoryType } from '@/generated/prisma/client';
import type { PrismaService } from '@/database/prisma.service';
import { CategoriesRepository } from './categories.repository';
import { normalizeCategoryName } from './category-name.util';

const ROOT_A = '01J00000000000000000000001';
const ROOT_B = '01J00000000000000000000002';
const CATEGORY_ID = '01J00000000000000000000003';

function setupRepository() {
  const category = {
    create: jest.fn().mockResolvedValue({ id: CATEGORY_ID }),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({ id: CATEGORY_ID }),
  };
  const transaction = { category };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };

  return {
    category,
    repository: new CategoriesRepository(prisma as unknown as PrismaService),
  };
}

function currentCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: CATEGORY_ID,
    name: 'Kinh tế',
    slug: 'kinh-te',
    parentId: null,
    type: CategoryType.NORMAL,
    _count: { children: 0 },
    children: [],
    ...overrides,
  };
}

function rootParent(id: string) {
  return {
    id,
    name: id === ROOT_A ? 'Kinh tế' : 'Văn học',
    parentId: null,
    type: CategoryType.NORMAL,
  };
}

describe('normalizeCategoryName', () => {
  it('trims, folds case and collapses redundant whitespace', () => {
    expect(normalizeCategoryName('  VĂN   học\nViệt Nam  ')).toBe(
      'văn học việt nam',
    );
  });
});

describe('CategoriesRepository scoped duplicate names', () => {
  it('rejects a root slug conflict before create writes', async () => {
    const { category, repository } = setupRepository();
    category.findFirst.mockResolvedValue({ id: ROOT_A });

    await expect(repository.create({ name: 'Kinh tế' })).rejects.toMatchObject({
      code: 'CATEGORY_SLUG_ALREADY_EXISTS',
    });
    expect(category.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate root name in the same type', async () => {
    const { category, repository } = setupRepository();
    category.findMany.mockResolvedValue([{ name: 'Văn học Việt Nam' }]);

    await expect(
      repository.create({
        name: '  VĂN   HỌC việt nam ',
        type: CategoryType.NORMAL,
      }),
    ).rejects.toMatchObject({
      code: 'CATEGORY_NAME_ALREADY_EXISTS',
    });
    expect(category.create).not.toHaveBeenCalled();
  });

  it('allows the same root name in a different type scope', async () => {
    const { category, repository } = setupRepository();

    await repository.create({
      name: 'Văn học Việt Nam',
      type: CategoryType.BRAND,
    });

    expect(category.findMany).toHaveBeenCalledWith({
      where: { parentId: null, type: CategoryType.BRAND },
      select: { name: true },
    });
    expect(category.create).toHaveBeenCalled();
    expect(category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'van-hoc-viet-nam' }),
      }),
    );
  });

  it('rejects a duplicate child name under the same parent', async () => {
    const { category, repository } = setupRepository();
    category.findUnique.mockResolvedValue(rootParent(ROOT_A));
    category.findMany.mockResolvedValue([{ name: 'Tiểu sử - Hồi ký' }]);

    await expect(
      repository.create({
        name: 'tiểu sử - hồi ký',
        parentId: ROOT_A,
        type: CategoryType.NORMAL,
      }),
    ).rejects.toMatchObject({
      code: 'CATEGORY_NAME_ALREADY_EXISTS',
    });
  });

  it('allows the same child name under a different parent', async () => {
    const { category, repository } = setupRepository();
    category.findUnique.mockResolvedValue(rootParent(ROOT_B));

    await repository.create({
      name: 'Tiểu sử - Hồi ký',
      parentId: ROOT_B,
      type: CategoryType.NORMAL,
    });

    expect(category.findMany).toHaveBeenCalledWith({
      where: { parentId: ROOT_B },
      select: { name: true },
    });
    expect(category.create).toHaveBeenCalled();
    expect(category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'van-hoc-tieu-su-hoi-ky' }),
      }),
    );
  });

  it('rejects renaming a root to another root name in its type', async () => {
    const { category, repository } = setupRepository();
    category.findUnique.mockResolvedValue(currentCategory());
    category.findMany.mockResolvedValue([{ name: 'Văn học Việt Nam' }]);

    await expect(
      repository.update(CATEGORY_ID, { name: 'văn học việt nam' }),
    ).rejects.toMatchObject({
      code: 'CATEGORY_NAME_ALREADY_EXISTS',
    });
  });

  it('rejects renaming a child to an existing sibling name', async () => {
    const { category, repository } = setupRepository();
    category.findUnique
      .mockResolvedValueOnce(currentCategory({ parentId: ROOT_A }))
      .mockResolvedValueOnce(rootParent(ROOT_A));
    category.findMany.mockResolvedValue([{ name: 'Tiểu sử - Hồi ký' }]);

    await expect(
      repository.update(CATEGORY_ID, { name: 'TIỂU SỬ - HỒI KÝ' }),
    ).rejects.toMatchObject({
      code: 'CATEGORY_NAME_ALREADY_EXISTS',
    });
  });

  it('allows an update that keeps the current name', async () => {
    const { category, repository } = setupRepository();
    category.findUnique.mockResolvedValue(currentCategory());

    await repository.update(CATEGORY_ID, { name: '  Kinh   tế ' });

    expect(category.findMany).toHaveBeenCalledWith({
      where: {
        parentId: null,
        type: CategoryType.NORMAL,
        id: { not: CATEGORY_ID },
      },
      select: { name: true },
    });
    expect(category.update).toHaveBeenCalled();
  });

  it('creates root and child slugs from their effective scope', async () => {
    const rootSetup = setupRepository();
    await rootSetup.repository.create({ name: 'Kinh tế' });
    expect(rootSetup.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'kinh-te' }),
      }),
    );

    const childSetup = setupRepository();
    childSetup.category.findUnique.mockResolvedValue(rootParent(ROOT_A));
    await childSetup.repository.create({
      name: 'Tiểu sử - Hồi ký',
      parentId: ROOT_A,
    });
    expect(childSetup.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'kinh-te-tieu-su-hoi-ky' }),
      }),
    );
  });

  it.each([
    {
      label: 'rename',
      current: currentCategory(),
      update: { name: 'Kinh doanh' },
      expected: 'kinh-doanh',
    },
    {
      label: 'move parent',
      current: currentCategory({ parentId: ROOT_A, slug: 'kinh-te-tieu-su' }),
      update: { parentId: ROOT_B },
      expected: 'van-hoc-kinh-te',
    },
    {
      label: 'root to child',
      current: currentCategory(),
      update: { parentId: ROOT_A },
      expected: 'kinh-te-kinh-te',
    },
    {
      label: 'child to root',
      current: currentCategory({ parentId: ROOT_A, slug: 'kinh-te-kinh-te' }),
      update: { parentId: null },
      expected: 'kinh-te',
    },
  ])(
    'regenerates the slug on $label',
    async ({ current, update, expected }) => {
      const { category, repository } = setupRepository();
      category.findUnique
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(rootParent(update.parentId ?? ROOT_A));

      await repository.update(CATEGORY_ID, update);

      expect(category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CATEGORY_ID },
          data: expect.objectContaining({ slug: expected }),
          select: expect.any(Object),
        }),
      );
    },
  );

  it('regenerates child slugs when their root is renamed', async () => {
    const { category, repository } = setupRepository();
    category.findUnique.mockResolvedValue(
      currentCategory({
        _count: { children: 1 },
        children: [{ id: ROOT_B, name: 'Tiểu sử', slug: 'kinh-te-tieu-su' }],
      }),
    );

    await repository.update(CATEGORY_ID, { name: 'Kinh doanh' });

    expect(category.update).toHaveBeenCalledWith({
      where: { id: ROOT_B },
      data: { slug: 'kinh-doanh-tieu-su' },
    });
  });

  it('detects a slug conflict before writing and rolls back all fields', async () => {
    const { category, repository } = setupRepository();
    category.findUnique.mockResolvedValue(currentCategory());
    category.findFirst.mockResolvedValue({ id: ROOT_A });

    await expect(
      repository.update(CATEGORY_ID, {
        name: 'Văn học',
        parentId: null,
        isActive: false,
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_SLUG_ALREADY_EXISTS' });

    expect(category.update).not.toHaveBeenCalled();
  });
});
