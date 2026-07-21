import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { normalizeMasterDataName } from '@/common/utils/master-data.util';
import { toSlug } from '@/common/utils/slug.util';

export const publisherSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true } },
} satisfies Prisma.PublisherSelect;
export type PublisherRecord = Prisma.PublisherGetPayload<{
  select: typeof publisherSelect;
}>;
export class PublisherDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
@Injectable()
export class PublishersRepository {
  constructor(private readonly prisma: PrismaService) {}
  list(
    where: Prisma.PublisherWhereInput,
    orderBy: Prisma.PublisherOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    return Promise.all([
      this.prisma.publisher.findMany({
        where,
        orderBy,
        skip,
        take,
        select: publisherSelect,
      }),
      this.prisma.publisher.count({ where }),
    ]);
  }
  findById(id: string) {
    return this.prisma.publisher.findUnique({
      where: { id },
      select: publisherSelect,
    });
  }
  create(data: { name: string }) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const name = normalizeMasterDataName(data.name);
      await this.assertAvailable(tx, name);
      return tx.publisher.create({
        data: { name, slug: toSlug(name) },
        select: publisherSelect,
      });
    });
  }
  update(id: string, data: { name?: string }) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.publisher.findUnique({
        where: { id },
        select: { name: true },
      });
      if (!current) return null;
      if (data.name === undefined)
        return tx.publisher.findUnique({
          where: { id },
          select: publisherSelect,
        });
      const name = normalizeMasterDataName(data.name);
      await this.assertAvailable(tx, name, id);
      return tx.publisher.update({
        where: { id },
        data: { name, slug: toSlug(name) },
        select: publisherSelect,
      });
    });
  }
  remove(id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.publisher.findUnique({
        where: { id },
        select: publisherSelect,
      });
      if (!current) return null;
      if (current._count.products > 0)
        throw new PublisherDomainError(
          'PUBLISHER_IN_USE',
          'Không thể xóa vì nhà xuất bản đang được sản phẩm sử dụng',
        );
      return tx.publisher.delete({ where: { id }, select: publisherSelect });
    });
  }
  private async assertAvailable(
    tx: Prisma.TransactionClient,
    name: string,
    excludeId?: string,
  ) {
    const scope = excludeId ? { id: { not: excludeId } } : {};
    if (
      await tx.publisher.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, ...scope },
        select: { id: true },
      })
    )
      throw new PublisherDomainError(
        'PUBLISHER_NAME_ALREADY_EXISTS',
        'Tên nhà xuất bản đã tồn tại',
      );
    const slug = toSlug(name);
    if (
      !slug ||
      (await tx.publisher.findFirst({
        where: { slug, ...scope },
        select: { id: true },
      }))
    )
      throw new PublisherDomainError(
        'PUBLISHER_SLUG_ALREADY_EXISTS',
        'Tên nhà xuất bản tạo ra đường dẫn đã tồn tại',
      );
  }
}
