import { Injectable } from '@nestjs/common';
import { Prisma, CategoryType } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { normalizeCategoryName } from './category-name.util';
import { buildCategorySlug } from './category-slug.util';

export const categoryManagementSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  parentId: true,
  type: true,
  imageUrl: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  parent: {
    select: {
      id: true,
      name: true,
      parentId: true,
      type: true,
      isActive: true,
    },
  },
  _count: { select: { children: true, products: true } },
} satisfies Prisma.CategorySelect;

export const categoryDetailSelect = {
  ...categoryManagementSelect,
  children: {
    select: {
      id: true,
      name: true,
      parentId: true,
      type: true,
      isActive: true,
    },
    orderBy: [
      { sortOrder: 'asc' as const },
      { name: 'asc' as const },
      { id: 'asc' as const },
    ],
  },
} satisfies Prisma.CategorySelect;

export type CategoryManagementRecord = Prisma.CategoryGetPayload<{
  select: typeof categoryManagementSelect;
}>;
export type CategoryDetailRecord = Prisma.CategoryGetPayload<{
  select: typeof categoryDetailSelect;
}>;

export class CategoryDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMatches(
    where: Prisma.CategoryWhereInput,
    orderBy: Prisma.CategoryOrderByWithRelationInput[],
  ) {
    return this.prisma.category.findMany({
      where,
      orderBy,
      select: categoryManagementSelect,
    });
  }

  findById(id: string) {
    return this.prisma.category.findUnique({
      where: { id },
      select: categoryDetailSelect,
    });
  }

  async create(data: {
    name: string;
    description?: string | null;
    parentId?: string | null;
    type?: CategoryType;
    isActive?: boolean;
    sortOrder?: number;
  }) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const type = data.type ?? CategoryType.NORMAL;
      await this.assertNameAvailable(tx, {
        name: data.name,
        parentId: data.parentId ?? null,
        type,
      });
      let parent: {
        id: string;
        name: string;
        parentId: string | null;
        type: CategoryType;
      } | null = null;
      if (data.parentId) {
        parent = await tx.category.findUnique({
          where: { id: data.parentId },
          select: { id: true, name: true, parentId: true, type: true },
        });
        this.assertValidParent(parent, type);
      }
      const slug = this.createSlug(data.name, parent?.name);
      await this.assertSlugsAvailable(tx, [{ id: null, slug }]);
      return tx.category.create({
        data: { ...data, slug, type },
        select: categoryDetailSelect,
      });
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      parentId?: string | null;
      type?: CategoryType;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.category.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          slug: true,
          parentId: true,
          type: true,
          _count: { select: { children: true } },
          children: { select: { id: true, name: true, slug: true } },
        },
      });
      if (!current) return null;

      const nextParentId =
        data.parentId === undefined ? current.parentId : data.parentId;
      const nextType = data.type ?? current.type;
      if (nextParentId === id) {
        throw new CategoryDomainError(
          'CATEGORY_SELF_PARENT',
          'Danh mục không thể làm cha của chính nó',
        );
      }
      if (current._count.children > 0 && nextParentId !== null) {
        throw new CategoryDomainError(
          'CATEGORY_HAS_CHILDREN',
          'Danh mục đang có danh mục con nên không thể chuyển thành cấp 2',
        );
      }
      if (
        data.type !== undefined &&
        data.type !== current.type &&
        (current.parentId !== null || current._count.children > 0)
      ) {
        throw new CategoryDomainError(
          'CATEGORY_TYPE_CHANGE_REQUIRES_DETACHED_NODE',
          'Phải tách danh mục khỏi cây trước khi đổi loại',
        );
      }
      await this.assertNameAvailable(tx, {
        name: data.name ?? current.name,
        parentId: nextParentId,
        type: nextType,
        excludeId: id,
      });
      let parent: {
        id: string;
        name: string;
        parentId: string | null;
        type: CategoryType;
      } | null = null;
      if (nextParentId) {
        parent = await tx.category.findUnique({
          where: { id: nextParentId },
          select: { id: true, name: true, parentId: true, type: true },
        });
        this.assertValidParent(parent, nextType);
      }
      const nextName = data.name ?? current.name;
      const slugTargets = [
        {
          id,
          currentSlug: current.slug,
          slug: this.createSlug(nextName, parent?.name),
        },
        ...(nextParentId === null && nextName !== current.name
          ? current.children.map((child) => ({
              id: child.id,
              currentSlug: child.slug,
              slug: this.createSlug(child.name, nextName),
            }))
          : []),
      ];
      await this.assertSlugsAvailable(tx, slugTargets);

      for (const target of slugTargets.filter(
        (candidate) => candidate.currentSlug !== candidate.slug,
      )) {
        await tx.category.update({
          where: { id: target.id },
          data: { slug: `__category_slug_rewrite__${target.id}` },
        });
      }

      const updated = await tx.category.update({
        where: { id },
        data: { ...data, slug: slugTargets[0].slug },
        select: categoryDetailSelect,
      });
      for (const target of slugTargets.slice(1)) {
        await tx.category.update({
          where: { id: target.id },
          data: { slug: target.slug },
        });
      }
      return updated;
    });
  }

  updateImage(id: string, imageUrl: string | null) {
    return this.prisma.category.update({
      where: { id },
      data: { imageUrl },
      select: categoryDetailSelect,
    });
  }

  async delete(id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.category.findUnique({
        where: { id },
        select: categoryDetailSelect,
      });
      if (!current) return null;
      if (current._count.children > 0) {
        throw new CategoryDomainError(
          'CATEGORY_HAS_CHILDREN',
          'Danh mục vẫn còn danh mục con',
        );
      }
      if (current._count.products > 0) {
        throw new CategoryDomainError(
          'CATEGORY_IN_USE',
          'Danh mục đang được sản phẩm sử dụng',
        );
      }
      await tx.category.delete({ where: { id } });
      return current;
    });
  }

  private assertValidParent(
    parent: {
      id: string;
      name: string;
      parentId: string | null;
      type: CategoryType;
    } | null,
    childType: CategoryType,
  ): void {
    if (!parent) {
      throw new CategoryDomainError(
        'CATEGORY_PARENT_NOT_FOUND',
        'Không tìm thấy danh mục cha',
      );
    }
    if (parent.parentId !== null) {
      throw new CategoryDomainError(
        'CATEGORY_PARENT_MUST_BE_ROOT',
        'Chỉ danh mục cấp 1 mới có thể làm danh mục cha',
      );
    }
    if (parent.type !== childType) {
      throw new CategoryDomainError(
        'CATEGORY_PARENT_TYPE_MISMATCH',
        'Danh mục cha và con phải cùng loại',
      );
    }
  }

  private createSlug(name: string, parentName?: string | null): string {
    const slug = buildCategorySlug(name, parentName);
    if (!slug) {
      throw new CategoryDomainError(
        'CATEGORY_SLUG_INVALID',
        'Tên danh mục không tạo được đường dẫn hợp lệ',
      );
    }
    return slug;
  }

  private async assertSlugsAvailable(
    tx: Prisma.TransactionClient,
    targets: readonly { id: string | null; slug: string }[],
  ): Promise<void> {
    if (new Set(targets.map((target) => target.slug)).size !== targets.length) {
      throw new CategoryDomainError(
        'CATEGORY_SLUG_ALREADY_EXISTS',
        'Tên danh mục tạo ra đường dẫn đã tồn tại',
      );
    }
    const affectedIds = targets.flatMap((target) =>
      target.id ? [target.id] : [],
    );
    for (const target of targets) {
      const conflict = await tx.category.findFirst({
        where: {
          slug: target.slug,
          ...(affectedIds.length > 0 ? { id: { notIn: affectedIds } } : {}),
        },
        select: { id: true },
      });
      if (conflict) {
        throw new CategoryDomainError(
          'CATEGORY_SLUG_ALREADY_EXISTS',
          'Tên danh mục tạo ra đường dẫn đã tồn tại',
        );
      }
    }
  }

  private async assertNameAvailable(
    tx: Prisma.TransactionClient,
    input: {
      name: string;
      parentId: string | null;
      type: CategoryType;
      excludeId?: string;
    },
  ): Promise<void> {
    const candidates = await tx.category.findMany({
      where: {
        ...(input.parentId === null
          ? { parentId: null, type: input.type }
          : { parentId: input.parentId }),
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
      select: { name: true },
    });
    const normalizedName = normalizeCategoryName(input.name);
    if (
      candidates.some(
        (candidate) => normalizeCategoryName(candidate.name) === normalizedName,
      )
    ) {
      throw new CategoryDomainError(
        'CATEGORY_NAME_ALREADY_EXISTS',
        'Tên danh mục đã tồn tại trong cùng phạm vi. Vui lòng chọn tên khác.',
      );
    }
  }
}
