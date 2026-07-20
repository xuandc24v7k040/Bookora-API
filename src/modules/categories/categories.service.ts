import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { ImageUploadService } from '@/shared/images/image-upload.service';
import { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';
import {
  CategoriesRepository,
  CategoryDomainError,
  type CategoryDetailRecord,
  type CategoryManagementRecord,
} from './categories.repository';
import {
  CategoriesTreeQueryDto,
  CategorySortField,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from './dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private readonly repository: CategoriesRepository,
    private readonly imageUpload: ImageUploadService,
    private readonly storage: R2ObjectStorageService,
  ) {}

  async findTree(query: CategoriesTreeQueryDto) {
    const orderBy = this.buildOrderBy(query);
    const fullWhere = this.buildWhere(query, true);
    const matched = await this.repository.findMatches(fullWhere, orderBy);
    if (matched.length === 0) return [];

    const matchedRoots = matched.filter((item) => item.parentId === null);
    const matchedChildren = matched.filter((item) => item.parentId !== null);

    if (query.level === 1) {
      return matchedRoots.map((root) => this.toResponse(root, []));
    }
    if (query.level === 2) {
      return matchedChildren.map((child) => this.toResponse(child, []));
    }

    const rootIds = new Set([
      ...matchedRoots.map((item) => item.id),
      ...matchedChildren.map((item) => item.parentId as string),
    ]);
    const roots = await this.repository.findMatches(
      { id: { in: [...rootIds] }, parentId: null },
      orderBy,
    );

    const childOr: Prisma.CategoryWhereInput[] = [];
    if (matchedChildren.length > 0) {
      childOr.push({ id: { in: matchedChildren.map((item) => item.id) } });
    }
    if (query.search && matchedRoots.length > 0 && query.level !== 1) {
      childOr.push({
        AND: [
          { parentId: { in: matchedRoots.map((item) => item.id) } },
          this.buildWhere(query, false, true),
        ],
      });
    }
    const children =
      query.level === 1 || childOr.length === 0
        ? []
        : await this.repository.findMatches({ OR: childOr }, orderBy);
    const childrenByParent = new Map<string, CategoryManagementRecord[]>();
    for (const child of children) {
      if (!child.parentId) continue;
      const siblings = childrenByParent.get(child.parentId) ?? [];
      siblings.push(child);
      childrenByParent.set(child.parentId, siblings);
    }

    return roots.map((root) => {
      const childResponses = (childrenByParent.get(root.id) ?? []).map(
        (child) => this.toResponse(child, []),
      );
      return this.toResponse(root, childResponses);
    });
  }

  async findOne(id: string) {
    const category = await this.repository.findById(id);
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Không tìm thấy danh mục',
      });
    }
    return this.toResponse(category, category.children);
  }

  async create(dto: CreateCategoryDto) {
    try {
      const category = await this.repository.create(dto);
      return this.toResponse(category, []);
    } catch (error) {
      this.rethrowDomainError(error);
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    try {
      const category = await this.repository.update(id, dto);
      if (!category) {
        throw new NotFoundException({
          code: 'CATEGORY_NOT_FOUND',
          message: 'Không tìm thấy danh mục',
        });
      }
      return this.toResponse(category, []);
    } catch (error) {
      this.rethrowDomainError(error);
    }
  }

  async uploadImage(id: string, file: Express.Multer.File) {
    const current = await this.repository.findById(id);
    if (!current) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Không tìm thấy danh mục',
      });
    }
    const uploaded = await this.imageUpload.upload({
      file,
      namespace: 'categories',
      ownerId: id,
      visibility: 'public',
      preset: 'category',
    });
    try {
      const updated = await this.repository.updateImage(id, uploaded.url);
      await this.cleanupPublicImage(current.imageUrl, 'replace-old');
      return this.toResponse(updated, []);
    } catch (error) {
      await this.cleanupKey(uploaded.key, 'replace-compensation');
      throw error;
    }
  }

  async removeImage(id: string) {
    const current = await this.repository.findById(id);
    if (!current) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Không tìm thấy danh mục',
      });
    }
    if (!current.imageUrl) return this.toResponse(current, []);
    const updated = await this.repository.updateImage(id, null);
    await this.cleanupPublicImage(current.imageUrl, 'remove');
    return this.toResponse(updated, []);
  }

  async remove(id: string) {
    try {
      const deleted = await this.repository.delete(id);
      if (!deleted) {
        throw new NotFoundException({
          code: 'CATEGORY_NOT_FOUND',
          message: 'Không tìm thấy danh mục',
        });
      }
      await this.cleanupPublicImage(deleted.imageUrl, 'category-delete');
      return this.toResponse(deleted, []);
    } catch (error) {
      this.rethrowDomainError(error);
    }
  }

  private buildWhere(
    query: CategoriesTreeQueryDto,
    includeSearch: boolean,
    forceChild = false,
  ): Prisma.CategoryWhereInput {
    const filters: Prisma.CategoryWhereInput[] = [];
    const search = query.search?.trim();
    if (includeSearch && search) {
      filters.push({ name: { contains: search, mode: 'insensitive' } });
    }
    if (query.type !== undefined) filters.push({ type: query.type });
    if (query.isActive !== undefined)
      filters.push({ isActive: query.isActive });
    if (query.parentId !== undefined)
      filters.push({ parentId: query.parentId });
    if (forceChild || query.level === 2)
      filters.push({ parentId: { not: null } });
    if (!forceChild && query.level === 1) filters.push({ parentId: null });
    return filters.length > 0 ? { AND: filters } : {};
  }

  private buildOrderBy(
    query: CategoriesTreeQueryDto,
  ): Prisma.CategoryOrderByWithRelationInput[] {
    const sortBy = query.sortBy ?? CategorySortField.SORT_ORDER;
    const sortOrder = query.sortOrder ?? 'asc';
    return [
      { [sortBy]: sortOrder },
      ...(sortBy === CategorySortField.SORT_ORDER
        ? [{ name: 'asc' as const }]
        : []),
      { id: 'asc' },
    ];
  }

  private toResponse(
    category: CategoryManagementRecord | CategoryDetailRecord,
    children: unknown[],
  ) {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      parentId: category.parentId,
      type: category.type,
      imageUrl: category.imageUrl,
      isActive: category.isActive,
      effectiveActive: category.isActive && (category.parent?.isActive ?? true),
      sortOrder: category.sortOrder,
      level: category.parentId === null ? (1 as const) : (2 as const),
      childrenCount: category._count.children,
      productCount: category._count.products,
      parent: category.parent,
      children,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  private rethrowDomainError(error: unknown): never {
    if (error instanceof CategoryDomainError) {
      const payload = { code: error.code, message: error.message };
      if (
        error.code === 'CATEGORY_HAS_CHILDREN' ||
        error.code === 'CATEGORY_IN_USE' ||
        error.code === 'CATEGORY_NAME_ALREADY_EXISTS' ||
        error.code === 'CATEGORY_SLUG_ALREADY_EXISTS' ||
        error.code === 'CATEGORY_TYPE_CHANGE_REQUIRES_DETACHED_NODE'
      ) {
        throw new ConflictException(payload);
      }
      throw new BadRequestException(payload);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException({
        code: 'CATEGORY_SLUG_ALREADY_EXISTS',
        message: 'Tên danh mục tạo ra đường dẫn đã tồn tại',
      });
    }
    throw error;
  }

  private async cleanupPublicImage(
    url: string | null,
    operation: string,
  ): Promise<void> {
    if (!url) return;
    const key = this.storage.extractPublicKey(url);
    if (!key) {
      this.logger.warn(
        `Skip image cleanup operation=${operation} reason=untrusted-url`,
      );
      return;
    }
    await this.cleanupKey(key, operation);
  }

  private async cleanupKey(key: string, operation: string): Promise<void> {
    try {
      await this.storage.delete({ visibility: 'public', key });
    } catch (error) {
      this.logger.error(
        `Category image cleanup failed operation=${operation} key=${key} error=${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }
}
