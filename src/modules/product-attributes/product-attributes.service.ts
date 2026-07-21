import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { UsageStatus } from '@/common/dto/master-data-query.dto';
import {
  paginationMeta,
  startOfNextVietnamDate,
  startOfVietnamDate,
} from '@/common/utils/master-data.util';
import {
  ProductAttributeListQueryDto,
  ProductAttributeSortField,
  type CreateProductAttributeDto,
  type UpdateProductAttributeDto,
} from './dto';
import {
  ProductAttributeDomainError,
  type ProductAttributeRecord,
  ProductAttributesRepository,
} from './product-attributes.repository';
@Injectable()
export class ProductAttributesService {
  constructor(private readonly repository: ProductAttributesRepository) {}
  async findAll(q: ProductAttributeListQueryDto) {
    const page = q.page ?? 1,
      limit = q.limit ?? 10;
    const [rows, total] = await this.repository.list(
      this.where(q),
      this.order(q),
      (page - 1) * limit,
      limit,
    );
    return {
      data: rows.map((r) => this.response(r)),
      meta: paginationMeta(total, page, limit),
    };
  }
  async findOne(id: string) {
    const r = await this.repository.findById(id);
    if (!r)
      throw new NotFoundException({
        code: 'PRODUCT_ATTRIBUTE_NOT_FOUND',
        message: 'Không tìm thấy thuộc tính sản phẩm',
      });
    return this.response(r);
  }
  async create(dto: CreateProductAttributeDto) {
    try {
      return this.response(await this.repository.create(dto));
    } catch (e) {
      this.rethrow(e);
    }
  }
  async update(id: string, dto: UpdateProductAttributeDto) {
    try {
      const r = await this.repository.update(id, dto);
      if (!r)
        throw new NotFoundException({
          code: 'PRODUCT_ATTRIBUTE_NOT_FOUND',
          message: 'Không tìm thấy thuộc tính sản phẩm',
        });
      return this.response(r);
    } catch (e) {
      this.rethrow(e);
    }
  }
  async remove(id: string) {
    try {
      const r = await this.repository.remove(id);
      if (!r)
        throw new NotFoundException({
          code: 'PRODUCT_ATTRIBUTE_NOT_FOUND',
          message: 'Không tìm thấy thuộc tính sản phẩm',
        });
      return this.response(r);
    } catch (e) {
      this.rethrow(e);
    }
  }
  private where(
    q: ProductAttributeListQueryDto,
  ): Prisma.ProductAttributeWhereInput {
    const a: Prisma.ProductAttributeWhereInput[] = [];
    if (q.search)
      a.push({
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          { code: { contains: q.search, mode: 'insensitive' } },
        ],
      });
    if (q.type) a.push({ type: q.type });
    if (q.usageStatus)
      a.push({
        values:
          q.usageStatus === UsageStatus.USED ? { some: {} } : { none: {} },
      });
    if (q.createdFrom || q.createdTo)
      a.push({
        createdAt: {
          ...(q.createdFrom ? { gte: startOfVietnamDate(q.createdFrom) } : {}),
          ...(q.createdTo ? { lt: startOfNextVietnamDate(q.createdTo) } : {}),
        },
      });
    return a.length ? { AND: a } : {};
  }
  private order(
    q: ProductAttributeListQueryDto,
  ): Prisma.ProductAttributeOrderByWithRelationInput[] {
    const f = q.sortBy ?? ProductAttributeSortField.CREATED_AT,
      d = q.sortOrder ?? 'desc';
    return [
      f === ProductAttributeSortField.USAGE_COUNT
        ? { values: { _count: d } }
        : { [f]: d },
      { id: 'asc' },
    ];
  }
  private response(r: ProductAttributeRecord) {
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      type: r.type,
      usageCount: r._count.values,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  private rethrow(e: unknown): never {
    if (e instanceof ProductAttributeDomainError)
      throw new ConflictException({ code: e.code, message: e.message });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new ConflictException({
        code: 'PRODUCT_ATTRIBUTE_CODE_ALREADY_EXISTS',
        message: 'Mã thuộc tính đã tồn tại',
      });
    throw e;
  }
}
