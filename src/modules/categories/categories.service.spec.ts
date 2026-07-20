import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConflictException } from '@nestjs/common';
import { CategoryType } from '@/generated/prisma/client';
import { CategoriesService } from './categories.service';
import {
  CategoriesRepository,
  CategoryDomainError,
  type CategoryManagementRecord,
} from './categories.repository';
import { CategoriesTreeQueryDto, CategorySortField } from './dto';
import type { ImageUploadService } from '@/shared/images/image-upload.service';
import type { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';

function categoryRecord(
  overrides: Partial<CategoryManagementRecord> = {},
): CategoryManagementRecord {
  return {
    id: '01J00000000000000000000000',
    name: 'Kinh tế',
    slug: 'kinh-te',
    description: null,
    parentId: null,
    type: CategoryType.NORMAL,
    imageUrl: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    parent: null,
    _count: { children: 0, products: 0 },
    ...overrides,
  };
}

describe('CategoriesService.findTree', () => {
  const repository = {
    findMatches: jest.fn(),
  };
  const service = new CategoriesService(
    repository as unknown as CategoriesRepository,
    {} as ImageUploadService,
    {} as R2ObjectStorageService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns child-only results without root wrappers and keeps parent context', async () => {
    const parent = categoryRecord();
    const child = categoryRecord({
      id: '01J00000000000000000000001',
      name: 'Kinh tế học',
      slug: 'kinh-te-hoc',
      parentId: parent.id,
      parent: {
        id: parent.id,
        name: parent.name,
        parentId: null,
        type: parent.type,
        isActive: true,
      },
    });
    repository.findMatches.mockResolvedValueOnce([child]);

    const result = await service.findTree({ level: 2 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: child.id,
      level: 2,
      parent: { id: parent.id, name: parent.name },
      children: [],
    });
    expect(repository.findMatches).toHaveBeenCalledTimes(1);
  });

  it('returns root-only results without children', async () => {
    const root = categoryRecord({ _count: { children: 2, products: 0 } });
    repository.findMatches.mockResolvedValueOnce([root]);

    const result = await service.findTree({ level: 1 });

    expect(result).toEqual([
      expect.objectContaining({ id: root.id, level: 1, children: [] }),
    ]);
    expect(repository.findMatches).toHaveBeenCalledTimes(1);
  });

  it('keeps the two-level tree when level is omitted', async () => {
    const root = categoryRecord({ _count: { children: 1, products: 0 } });
    const child = categoryRecord({
      id: '01J00000000000000000000001',
      name: 'Kinh tế học',
      slug: 'kinh-te-hoc',
      parentId: root.id,
      parent: {
        id: root.id,
        name: root.name,
        parentId: null,
        type: root.type,
        isActive: true,
      },
    });
    repository.findMatches
      .mockResolvedValueOnce([root, child])
      .mockResolvedValueOnce([root])
      .mockResolvedValueOnce([child]);

    const result = await service.findTree({});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: root.id,
      level: 1,
      children: [expect.objectContaining({ id: child.id, level: 2 })],
    });
  });

  it('composes child, search, type, status and stable server sorting', async () => {
    repository.findMatches.mockResolvedValueOnce([]);

    await service.findTree({
      level: 2,
      search: 'kinh tế',
      type: CategoryType.NORMAL,
      isActive: false,
      sortBy: CategorySortField.NAME,
      sortOrder: 'desc',
    });

    expect(repository.findMatches).toHaveBeenCalledWith(
      {
        AND: expect.arrayContaining([
          { name: { contains: 'kinh tế', mode: 'insensitive' } },
          { type: CategoryType.NORMAL },
          { isActive: false },
          { parentId: { not: null } },
        ]),
      },
      [{ name: 'desc' }, { id: 'asc' }],
    );
  });

  it('rejects an unsupported level in the request DTO', async () => {
    const dto = plainToInstance(CategoriesTreeQueryDto, { level: 3 });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'level')).toBe(true);
  });
});

describe('CategoriesService duplicate-name errors', () => {
  it('returns the stable machine code as a 409 conflict', async () => {
    const repository = {
      create: jest.fn(),
    };
    const domainError = new CategoryDomainError(
      'CATEGORY_NAME_ALREADY_EXISTS',
      'Tên danh mục đã tồn tại trong cùng phạm vi. Vui lòng chọn tên khác.',
    );
    repository.create.mockRejectedValue(domainError);
    const service = new CategoriesService(
      repository as unknown as CategoriesRepository,
      {} as ImageUploadService,
      {} as R2ObjectStorageService,
    );

    const error = await service
      .create({ name: 'Văn học Việt Nam' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'CATEGORY_NAME_ALREADY_EXISTS',
      message:
        'Tên danh mục đã tồn tại trong cùng phạm vi. Vui lòng chọn tên khác.',
    });
  });

  it('returns CATEGORY_SLUG_ALREADY_EXISTS as a 409 conflict', async () => {
    const repository = {
      update: jest
        .fn()
        .mockRejectedValue(
          new CategoryDomainError(
            'CATEGORY_SLUG_ALREADY_EXISTS',
            'Tên danh mục tạo ra đường dẫn đã tồn tại',
          ),
        ),
    };
    const service = new CategoriesService(
      repository as unknown as CategoriesRepository,
      {} as ImageUploadService,
      {} as R2ObjectStorageService,
    );

    const error = await service
      .update('01J00000000000000000000000', { name: 'Văn học' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      code: 'CATEGORY_SLUG_ALREADY_EXISTS',
      message: 'Tên danh mục tạo ra đường dẫn đã tồn tại',
    });
  });
});
