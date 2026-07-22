import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { StockListQueryDto, StockSortField, StockState } from './dto';

export const variantPresentationSelect = {
  id: true,
  productId: true,
  name: true,
  sku: true,
  barcode: true,
  isDefault: true,
  isActive: true,
  product: {
    select: {
      name: true,
      status: true,
      media: {
        where: { variantId: null, isPrimary: true },
        select: { url: true },
        take: 1,
      },
    },
  },
  media: {
    where: { isPrimary: true },
    select: { url: true },
    take: 1,
  },
  optionValues: {
    orderBy: { option: { sortOrder: 'asc' as const } },
    select: {
      option: { select: { name: true } },
      optionValue: { select: { label: true } },
    },
  },
} satisfies Prisma.ProductVariantSelect;

export const stockSelect = {
  variantId: true,
  quantity: true,
  lowStockThreshold: true,
  updatedAt: true,
  variant: { select: variantPresentationSelect },
} satisfies Prisma.BranchProductStockSelect;

export type StockRecord = Prisma.BranchProductStockGetPayload<{
  select: typeof stockSelect;
}>;

export type VariantOptionRecord = Prisma.ProductVariantGetPayload<{
  select: typeof variantPresentationSelect;
}>;

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listVariantOptions(
    search: string | undefined,
    skip: number,
    take: number,
  ) {
    const matchingVariant: Prisma.ProductVariantWhereInput = {
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
              {
                optionValues: {
                  some: {
                    optionValue: {
                      label: { contains: search, mode: 'insensitive' },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const productWhere: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      variants: { some: { isActive: true } },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { variants: { some: matchingVariant } },
            ],
          }
        : {}),
    };
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: productWhere,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take,
        select: { id: true },
      }),
      this.prisma.product.count({ where: productWhere }),
    ]);
    const productIds = products.map(({ id }) => id);
    const variants =
      productIds.length === 0
        ? []
        : await this.prisma.productVariant.findMany({
            where: { productId: { in: productIds }, isActive: true },
            orderBy: [
              { product: { name: 'asc' } },
              { sku: 'asc' },
              { id: 'asc' },
            ],
            select: variantPresentationSelect,
          });
    return [variants, total] as const;
  }

  listStocks(branchId: string, query: StockListQueryDto) {
    const search = query.search;
    const where: Prisma.BranchProductStockWhereInput = {
      branchId,
      ...(search
        ? {
            variant: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { barcode: { contains: search, mode: 'insensitive' } },
                {
                  product: { name: { contains: search, mode: 'insensitive' } },
                },
                {
                  optionValues: {
                    some: {
                      optionValue: {
                        label: { contains: search, mode: 'insensitive' },
                      },
                    },
                  },
                },
              ],
            },
          }
        : {}),
      ...this.stockStateWhere(query.stockState),
    };
    const direction = query.sortOrder ?? 'desc';
    const sortBy = query.sortBy ?? StockSortField.UPDATED_AT;
    const orderBy: Prisma.BranchProductStockOrderByWithRelationInput =
      sortBy === StockSortField.PRODUCT_NAME
        ? { variant: { product: { name: direction } } }
        : sortBy === StockSortField.SKU
          ? { variant: { sku: direction } }
          : { [sortBy]: direction };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    return Promise.all([
      this.prisma.branchProductStock.findMany({
        where,
        orderBy: [orderBy, { variantId: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: stockSelect,
      }),
      this.prisma.branchProductStock.count({ where }),
    ]);
  }

  async updateThreshold(
    branchId: string,
    variantId: string,
    lowStockThreshold: number,
  ) {
    const result = await this.prisma.branchProductStock.updateMany({
      where: { branchId, variantId },
      data: { lowStockThreshold },
    });
    if (result.count === 0) return null;
    return this.prisma.branchProductStock.findUnique({
      where: { branchId_variantId: { branchId, variantId } },
      select: stockSelect,
    });
  }

  private stockStateWhere(
    state: StockState | undefined,
  ): Prisma.BranchProductStockWhereInput {
    if (state === StockState.OUT_OF_STOCK) return { quantity: 0 };
    if (state === StockState.LOW_STOCK)
      return {
        quantity: {
          gt: 0,
          lte: this.prisma.branchProductStock.fields.lowStockThreshold,
        },
      };
    if (state === StockState.IN_STOCK)
      return {
        quantity: {
          gt: this.prisma.branchProductStock.fields.lowStockThreshold,
        },
      };
    return {};
  }
}
