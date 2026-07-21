import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { toSlug } from '@/common/utils/slug.util';
import { normalizeMasterDataName } from '@/common/utils/master-data.util';

export const supplierSelect = {
  id: true,
  name: true,
  slug: true,
  phone: true,
  email: true,
  address: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true } },
} satisfies Prisma.SupplierSelect;

export type SupplierRecord = Prisma.SupplierGetPayload<{
  select: typeof supplierSelect;
}>;

export class SupplierDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class SuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(
    where: Prisma.SupplierWhereInput,
    orderBy: Prisma.SupplierOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    return Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy,
        skip,
        take,
        select: supplierSelect,
      }),
      this.prisma.supplier.count({ where }),
    ]);
  }

  findById(id: string) {
    return this.prisma.supplier.findUnique({
      where: { id },
      select: supplierSelect,
    });
  }

  create(data: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  }) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const name = normalizeMasterDataName(data.name);
      await this.assertAvailable(tx, name);
      return tx.supplier.create({
        data: { ...data, name, slug: toSlug(name) },
        select: supplierSelect,
      });
    });
  }

  update(
    id: string,
    data: {
      name?: string;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
    },
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.supplier.findUnique({
        where: { id },
        select: { id: true, name: true },
      });
      if (!current) return null;
      const name =
        data.name === undefined
          ? current.name
          : normalizeMasterDataName(data.name);
      await this.assertAvailable(tx, name, id);
      return tx.supplier.update({
        where: { id },
        data: {
          ...data,
          ...(data.name === undefined ? {} : { name, slug: toSlug(name) }),
        },
        select: supplierSelect,
      });
    });
  }

  remove(id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.supplier.findUnique({
        where: { id },
        select: supplierSelect,
      });
      if (!current) return null;
      if (current._count.products > 0)
        throw new SupplierDomainError(
          'SUPPLIER_IN_USE',
          'Không thể xóa vì nhà cung cấp đang được sản phẩm sử dụng',
        );
      return tx.supplier.delete({ where: { id }, select: supplierSelect });
    });
  }

  private async assertAvailable(
    tx: Prisma.TransactionClient,
    name: string,
    excludeId?: string,
  ) {
    const existing = await tx.supplier.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, slug: true },
    });
    if (existing)
      throw new SupplierDomainError(
        'SUPPLIER_NAME_ALREADY_EXISTS',
        'Tên nhà cung cấp đã tồn tại',
      );
    const slug = toSlug(name);
    if (!slug)
      throw new SupplierDomainError(
        'SUPPLIER_SLUG_ALREADY_EXISTS',
        'Tên nhà cung cấp không thể tạo đường dẫn hợp lệ',
      );
    const slugOwner = await tx.supplier.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (slugOwner)
      throw new SupplierDomainError(
        'SUPPLIER_SLUG_ALREADY_EXISTS',
        'Tên nhà cung cấp tạo ra đường dẫn đã tồn tại',
      );
  }
}
