import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { normalizeMasterDataName } from '@/common/utils/master-data.util';
import { toSlug } from '@/common/utils/slug.util';
export const authorSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true } },
} satisfies Prisma.AuthorSelect;
export type AuthorRecord = Prisma.AuthorGetPayload<{
  select: typeof authorSelect;
}>;
export class AuthorDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
@Injectable()
export class AuthorsRepository {
  constructor(private readonly prisma: PrismaService) {}
  list(
    where: Prisma.AuthorWhereInput,
    orderBy: Prisma.AuthorOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    return Promise.all([
      this.prisma.author.findMany({
        where,
        orderBy,
        skip,
        take,
        select: authorSelect,
      }),
      this.prisma.author.count({ where }),
    ]);
  }
  findById(id: string) {
    return this.prisma.author.findUnique({
      where: { id },
      select: authorSelect,
    });
  }
  create(data: { name: string }) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const name = normalizeMasterDataName(data.name);
      await this.assertAvailable(tx, name);
      return tx.author.create({
        data: { name, slug: toSlug(name) },
        select: authorSelect,
      });
    });
  }
  update(id: string, data: { name?: string }) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.author.findUnique({
        where: { id },
        select: { name: true },
      });
      if (!current) return null;
      if (data.name === undefined)
        return tx.author.findUnique({ where: { id }, select: authorSelect });
      const name = normalizeMasterDataName(data.name);
      await this.assertAvailable(tx, name, id);
      return tx.author.update({
        where: { id },
        data: { name, slug: toSlug(name) },
        select: authorSelect,
      });
    });
  }
  remove(id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.author.findUnique({
        where: { id },
        select: authorSelect,
      });
      if (!current) return null;
      if (current._count.products > 0)
        throw new AuthorDomainError(
          'AUTHOR_IN_USE',
          'Không thể xóa vì tác giả đang được gắn với sản phẩm',
        );
      return tx.author.delete({ where: { id }, select: authorSelect });
    });
  }
  private async assertAvailable(
    tx: Prisma.TransactionClient,
    name: string,
    excludeId?: string,
  ) {
    const scope = excludeId ? { id: { not: excludeId } } : {};
    if (
      await tx.author.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, ...scope },
        select: { id: true },
      })
    )
      throw new AuthorDomainError(
        'AUTHOR_NAME_ALREADY_EXISTS',
        'Tên tác giả đã tồn tại',
      );
    const slug = toSlug(name);
    if (
      !slug ||
      (await tx.author.findFirst({
        where: { slug, ...scope },
        select: { id: true },
      }))
    )
      throw new AuthorDomainError(
        'AUTHOR_SLUG_ALREADY_EXISTS',
        'Tên tác giả tạo ra đường dẫn đã tồn tại',
      );
  }
}
