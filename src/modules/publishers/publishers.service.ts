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
  PublisherListQueryDto,
  PublisherSortField,
  type CreatePublisherDto,
  type UpdatePublisherDto,
} from './dto';
import {
  PublisherDomainError,
  type PublisherRecord,
  PublishersRepository,
} from './publishers.repository';
@Injectable()
export class PublishersService {
  constructor(private readonly repository: PublishersRepository) {}
  async findAll(query: PublisherListQueryDto) {
    const page = query.page ?? 1,
      limit = query.limit ?? 10;
    const [rows, total] = await this.repository.list(
      this.where(query),
      this.order(query),
      (page - 1) * limit,
      limit,
    );
    return {
      data: rows.map((row) => this.response(row)),
      meta: paginationMeta(total, page, limit),
    };
  }
  async findOne(id: string) {
    const row = await this.repository.findById(id);
    if (!row)
      throw new NotFoundException({
        code: 'PUBLISHER_NOT_FOUND',
        message: 'Không tìm thấy nhà xuất bản',
      });
    return this.response(row);
  }
  async create(dto: CreatePublisherDto) {
    try {
      return this.response(await this.repository.create(dto));
    } catch (e) {
      this.rethrow(e);
    }
  }
  async update(id: string, dto: UpdatePublisherDto) {
    try {
      const row = await this.repository.update(id, dto);
      if (!row)
        throw new NotFoundException({
          code: 'PUBLISHER_NOT_FOUND',
          message: 'Không tìm thấy nhà xuất bản',
        });
      return this.response(row);
    } catch (e) {
      this.rethrow(e);
    }
  }
  async remove(id: string) {
    try {
      const row = await this.repository.remove(id);
      if (!row)
        throw new NotFoundException({
          code: 'PUBLISHER_NOT_FOUND',
          message: 'Không tìm thấy nhà xuất bản',
        });
      return this.response(row);
    } catch (e) {
      this.rethrow(e);
    }
  }
  private where(q: PublisherListQueryDto): Prisma.PublisherWhereInput {
    const a: Prisma.PublisherWhereInput[] = [];
    if (q.search) a.push({ name: { contains: q.search, mode: 'insensitive' } });
    if (q.usageStatus)
      a.push({
        products:
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
    q: PublisherListQueryDto,
  ): Prisma.PublisherOrderByWithRelationInput[] {
    const f = q.sortBy ?? PublisherSortField.CREATED_AT,
      d = q.sortOrder ?? 'desc';
    return [
      f === PublisherSortField.USAGE_COUNT
        ? { products: { _count: d } }
        : { [f]: d },
      { id: 'asc' },
    ];
  }
  private response(r: PublisherRecord) {
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      usageCount: r._count.products,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  private rethrow(e: unknown): never {
    if (e instanceof PublisherDomainError)
      throw new ConflictException({ code: e.code, message: e.message });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new ConflictException({
        code: 'PUBLISHER_SLUG_ALREADY_EXISTS',
        message: 'Tên nhà xuất bản tạo ra đường dẫn đã tồn tại',
      });
    throw e;
  }
}
