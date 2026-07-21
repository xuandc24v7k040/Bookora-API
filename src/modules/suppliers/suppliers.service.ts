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
  SupplierListQueryDto,
  SupplierSortField,
  type CreateSupplierDto,
  type UpdateSupplierDto,
} from './dto';
import {
  SupplierDomainError,
  type SupplierRecord,
  SuppliersRepository,
} from './suppliers.repository';

@Injectable()
export class SuppliersService {
  constructor(private readonly repository: SuppliersRepository) {}

  async findAll(query: SupplierListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);
    const [records, total] = await this.repository.list(
      where,
      orderBy,
      (page - 1) * limit,
      limit,
    );
    return {
      data: records.map((record) => this.toResponse(record)),
      meta: paginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const record = await this.repository.findById(id);
    if (!record)
      throw new NotFoundException({
        code: 'SUPPLIER_NOT_FOUND',
        message: 'Không tìm thấy nhà cung cấp',
      });
    return this.toResponse(record);
  }

  async create(dto: CreateSupplierDto) {
    try {
      return this.toResponse(await this.repository.create(dto));
    } catch (error) {
      this.rethrow(error);
    }
  }
  async update(id: string, dto: UpdateSupplierDto) {
    try {
      const record = await this.repository.update(id, dto);
      if (!record)
        throw new NotFoundException({
          code: 'SUPPLIER_NOT_FOUND',
          message: 'Không tìm thấy nhà cung cấp',
        });
      return this.toResponse(record);
    } catch (error) {
      this.rethrow(error);
    }
  }
  async remove(id: string) {
    try {
      const record = await this.repository.remove(id);
      if (!record)
        throw new NotFoundException({
          code: 'SUPPLIER_NOT_FOUND',
          message: 'Không tìm thấy nhà cung cấp',
        });
      return this.toResponse(record);
    } catch (error) {
      this.rethrow(error);
    }
  }

  private buildWhere(query: SupplierListQueryDto): Prisma.SupplierWhereInput {
    const filters: Prisma.SupplierWhereInput[] = [];
    if (query.search)
      filters.push({
        OR: ['name', 'phone', 'email', 'address'].map((field) => ({
          [field]: { contains: query.search, mode: 'insensitive' },
        })),
      });
    if (query.hasPhone !== undefined)
      filters.push(query.hasPhone ? { phone: { not: null } } : { phone: null });
    if (query.hasEmail !== undefined)
      filters.push(query.hasEmail ? { email: { not: null } } : { email: null });
    if (query.usageStatus)
      filters.push({
        products:
          query.usageStatus === UsageStatus.USED ? { some: {} } : { none: {} },
      });
    if (query.createdFrom || query.createdTo)
      filters.push({
        createdAt: {
          ...(query.createdFrom
            ? { gte: startOfVietnamDate(query.createdFrom) }
            : {}),
          ...(query.createdTo
            ? { lt: startOfNextVietnamDate(query.createdTo) }
            : {}),
        },
      });
    return filters.length ? { AND: filters } : {};
  }

  private buildOrderBy(
    query: SupplierListQueryDto,
  ): Prisma.SupplierOrderByWithRelationInput[] {
    const field = query.sortBy ?? SupplierSortField.CREATED_AT;
    const direction = query.sortOrder ?? 'desc';
    const primary: Prisma.SupplierOrderByWithRelationInput =
      field === SupplierSortField.USAGE_COUNT
        ? { products: { _count: direction } }
        : { [field]: direction };
    return [primary, { id: 'asc' }];
  }

  private toResponse(record: SupplierRecord) {
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      phone: record.phone,
      email: record.email,
      address: record.address,
      usageCount: record._count.products,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
  private rethrow(error: unknown): never {
    if (error instanceof SupplierDomainError)
      throw new ConflictException({ code: error.code, message: error.message });
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException({
        code: 'SUPPLIER_SLUG_ALREADY_EXISTS',
        message: 'Tên nhà cung cấp tạo ra đường dẫn đã tồn tại',
      });
    throw error;
  }
}
