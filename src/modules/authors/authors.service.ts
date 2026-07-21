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
  AuthorListQueryDto,
  AuthorSortField,
  type CreateAuthorDto,
  type UpdateAuthorDto,
} from './dto';
import {
  AuthorDomainError,
  type AuthorRecord,
  AuthorsRepository,
} from './authors.repository';
@Injectable()
export class AuthorsService {
  constructor(private readonly repository: AuthorsRepository) {}
  async findAll(q: AuthorListQueryDto) {
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
        code: 'AUTHOR_NOT_FOUND',
        message: 'Không tìm thấy tác giả',
      });
    return this.response(r);
  }
  async create(dto: CreateAuthorDto) {
    try {
      return this.response(await this.repository.create(dto));
    } catch (e) {
      this.rethrow(e);
    }
  }
  async update(id: string, dto: UpdateAuthorDto) {
    try {
      const r = await this.repository.update(id, dto);
      if (!r)
        throw new NotFoundException({
          code: 'AUTHOR_NOT_FOUND',
          message: 'Không tìm thấy tác giả',
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
          code: 'AUTHOR_NOT_FOUND',
          message: 'Không tìm thấy tác giả',
        });
      return this.response(r);
    } catch (e) {
      this.rethrow(e);
    }
  }
  private where(q: AuthorListQueryDto): Prisma.AuthorWhereInput {
    const a: Prisma.AuthorWhereInput[] = [];
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
    q: AuthorListQueryDto,
  ): Prisma.AuthorOrderByWithRelationInput[] {
    const f = q.sortBy ?? AuthorSortField.CREATED_AT,
      d = q.sortOrder ?? 'desc';
    return [
      f === AuthorSortField.USAGE_COUNT
        ? { products: { _count: d } }
        : { [f]: d },
      { id: 'asc' },
    ];
  }
  private response(r: AuthorRecord) {
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
    if (e instanceof AuthorDomainError)
      throw new ConflictException({ code: e.code, message: e.message });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new ConflictException({
        code: 'AUTHOR_SLUG_ALREADY_EXISTS',
        message: 'Tên tác giả tạo ra đường dẫn đã tồn tại',
      });
    throw e;
  }
}
