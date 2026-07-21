import { Injectable } from '@nestjs/common';
import { Prisma, ProductAttributeType } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import {
  normalizeAttributeCode,
  normalizeMasterDataName,
} from '@/common/utils/master-data.util';
export const productAttributeSelect = {
  id: true,
  name: true,
  code: true,
  type: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { values: true } },
} satisfies Prisma.ProductAttributeSelect;
export type ProductAttributeRecord = Prisma.ProductAttributeGetPayload<{
  select: typeof productAttributeSelect;
}>;
export class ProductAttributeDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
@Injectable()
export class ProductAttributesRepository {
  constructor(private readonly prisma: PrismaService) {}
  list(
    where: Prisma.ProductAttributeWhereInput,
    orderBy: Prisma.ProductAttributeOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    return Promise.all([
      this.prisma.productAttribute.findMany({
        where,
        orderBy,
        skip,
        take,
        select: productAttributeSelect,
      }),
      this.prisma.productAttribute.count({ where }),
    ]);
  }
  findById(id: string) {
    return this.prisma.productAttribute.findUnique({
      where: { id },
      select: productAttributeSelect,
    });
  }
  create(data: { name: string; code: string; type: ProductAttributeType }) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const name = normalizeMasterDataName(data.name),
        code = normalizeAttributeCode(data.code);
      await this.assertAvailable(tx, name, code);
      return tx.productAttribute.create({
        data: { name, code, type: data.type },
        select: productAttributeSelect,
      });
    });
  }
  update(
    id: string,
    data: { name?: string; code?: string; type?: ProductAttributeType },
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.productAttribute.findUnique({
        where: { id },
        select: productAttributeSelect,
      });
      if (!current) return null;
      const name =
          data.name === undefined
            ? current.name
            : normalizeMasterDataName(data.name),
        code =
          data.code === undefined
            ? current.code
            : normalizeAttributeCode(data.code);
      await this.assertAvailable(tx, name, code, id);
      if (
        current._count.values > 0 &&
        data.code !== undefined &&
        code !== current.code
      )
        throw new ProductAttributeDomainError(
          'PRODUCT_ATTRIBUTE_CODE_CHANGE_REQUIRES_UNUSED',
          'Không thể đổi mã khi thuộc tính đang được sử dụng',
        );
      if (
        current._count.values > 0 &&
        data.type !== undefined &&
        data.type !== current.type
      )
        throw new ProductAttributeDomainError(
          'PRODUCT_ATTRIBUTE_TYPE_CHANGE_REQUIRES_UNUSED',
          'Không thể đổi kiểu dữ liệu khi thuộc tính đang được sử dụng',
        );
      return tx.productAttribute.update({
        where: { id },
        data: {
          ...(data.name === undefined ? {} : { name }),
          ...(data.code === undefined ? {} : { code }),
          ...(data.type === undefined ? {} : { type: data.type }),
        },
        select: productAttributeSelect,
      });
    });
  }
  remove(id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.productAttribute.findUnique({
        where: { id },
        select: productAttributeSelect,
      });
      if (!current) return null;
      if (current._count.values > 0)
        throw new ProductAttributeDomainError(
          'PRODUCT_ATTRIBUTE_IN_USE',
          'Không thể xóa vì thuộc tính đang có giá trị trên sản phẩm',
        );
      return tx.productAttribute.delete({
        where: { id },
        select: productAttributeSelect,
      });
    });
  }
  private async assertAvailable(
    tx: Prisma.TransactionClient,
    name: string,
    code: string,
    excludeId?: string,
  ) {
    const scope = excludeId ? { id: { not: excludeId } } : {};
    if (
      await tx.productAttribute.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, ...scope },
        select: { id: true },
      })
    )
      throw new ProductAttributeDomainError(
        'PRODUCT_ATTRIBUTE_NAME_ALREADY_EXISTS',
        'Tên thuộc tính đã tồn tại',
      );
    if (
      await tx.productAttribute.findFirst({
        where: { code: { equals: code, mode: 'insensitive' }, ...scope },
        select: { id: true },
      })
    )
      throw new ProductAttributeDomainError(
        'PRODUCT_ATTRIBUTE_CODE_ALREADY_EXISTS',
        'Mã thuộc tính đã tồn tại',
      );
  }
}
