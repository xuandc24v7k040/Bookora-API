import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import {
  InventoryMovementSourceType,
  InventoryMovementType,
  Prisma,
  ProductStatus,
  StockReceiptStatus,
  StockReceiptType,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { SortDirection } from '@/common/enums';
import {
  startOfNextVietnamDate,
  startOfVietnamDate,
} from '@/common/utils/master-data.util';
import {
  type AdjustInventoryQuantityDto,
  GroupedStockSortField,
  type GroupedStockListQueryDto,
  InventoryAdjustmentDirection,
  type InventoryMovementListQueryDto,
  StockListQueryDto,
  StockSortField,
  StockState,
} from './dto';
import { recordInventoryMovement } from './inventory-movement';

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

const groupedStockProductSelect = {
  id: true,
  name: true,
  media: {
    where: { variantId: null, isPrimary: true },
    select: { url: true },
    take: 1,
  },
  options: { select: { id: true }, take: 1 },
  variants: {
    orderBy: [{ isDefault: 'desc' as const }, { sku: 'asc' as const }],
    select: {
      ...variantPresentationSelect,
      stocks: {
        select: {
          quantity: true,
          lowStockThreshold: true,
          updatedAt: true,
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

export type GroupedStockRecord = Prisma.ProductGetPayload<{
  select: typeof groupedStockProductSelect;
}>;

const movementSelect = {
  id: true,
  type: true,
  quantityChange: true,
  beforeQuantity: true,
  afterQuantity: true,
  reason: true,
  sourceType: true,
  sourceId: true,
  sourceCode: true,
  createdAt: true,
  actor: { select: { id: true, fullName: true, email: true } },
  variant: { select: variantPresentationSelect },
} satisfies Prisma.InventoryMovementSelect;

export type InventoryMovementRecord = Prisma.InventoryMovementGetPayload<{
  select: typeof movementSelect;
}>;

export class InventoryDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

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

  async listGroupedStocks(branchId: string, query: GroupedStockListQueryDto) {
    const search = query.search?.trim();
    const searchSql = search
      ? Prisma.sql`AND (
          p."name" ILIKE ${`%${search}%`}
          OR EXISTS (
            SELECT 1 FROM "product_variants" sv
            WHERE sv."product_id" = p."id"
              AND (sv."name" ILIKE ${`%${search}%`} OR sv."sku" ILIKE ${`%${search}%`} OR sv."barcode" ILIKE ${`%${search}%`})
          )
        )`
      : Prisma.empty;
    const stateSql =
      query.stockState === StockState.OUT_OF_STOCK
        ? Prisma.sql`HAVING BOOL_AND(s."quantity" = 0)`
        : query.stockState === StockState.LOW_STOCK
          ? Prisma.sql`HAVING NOT BOOL_AND(s."quantity" = 0) AND BOOL_OR(s."quantity" <= s."low_stock_threshold")`
          : query.stockState === StockState.IN_STOCK
            ? Prisma.sql`HAVING BOOL_AND(s."quantity" > s."low_stock_threshold")`
            : Prisma.empty;
    const direction =
      query.sortOrder === SortDirection.ASC
        ? Prisma.sql`ASC`
        : Prisma.sql`DESC`;
    const orderSql =
      query.sortBy === GroupedStockSortField.PRODUCT_NAME
        ? Prisma.sql`p."name" ${direction}, p."id" ASC`
        : query.sortBy === GroupedStockSortField.QUANTITY
          ? Prisma.sql`SUM(s."quantity") ${direction}, p."id" ASC`
          : Prisma.sql`MAX(s."updated_at") ${direction}, p."id" ASC`;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;
    const base = Prisma.sql`
      FROM "products" p
      JOIN "product_variants" v ON v."product_id" = p."id"
      JOIN "branch_product_stocks" s ON s."variant_id" = v."id"
      WHERE s."branch_id" = ${branchId}
      ${searchSql}
      GROUP BY p."id", p."name"
      ${stateSql}
    `;
    const [ids, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p."id" ${base}
        ORDER BY ${orderSql}
        LIMIT ${limit} OFFSET ${offset}
      `),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count" FROM (
          SELECT p."id" ${base}
        ) grouped_products
      `),
    ]);
    const productIds = ids.map(({ id }) => id);
    const records =
      productIds.length === 0
        ? []
        : await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
              ...groupedStockProductSelect,
              variants: {
                ...groupedStockProductSelect.variants,
                where: { stocks: { some: { branchId } } },
                select: {
                  ...groupedStockProductSelect.variants.select,
                  stocks: {
                    where: { branchId },
                    select:
                      groupedStockProductSelect.variants.select.stocks.select,
                  },
                },
              },
            },
          });
    const order = new Map(productIds.map((id, index) => [id, index]));
    records.sort((left, right) => order.get(left.id)! - order.get(right.id)!);
    return [records, Number(countRows[0]?.count ?? 0n)] as const;
  }

  listMovements(branchId: string, query: InventoryMovementListQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.InventoryMovementWhereInput = {
      branchId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom
                ? { gte: startOfVietnamDate(query.dateFrom) }
                : {}),
              ...(query.dateTo
                ? { lt: startOfNextVietnamDate(query.dateTo) }
                : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { sourceCode: { contains: search, mode: 'insensitive' } },
              { variant: { name: { contains: search, mode: 'insensitive' } } },
              { variant: { sku: { contains: search, mode: 'insensitive' } } },
              {
                variant: { barcode: { contains: search, mode: 'insensitive' } },
              },
              {
                variant: {
                  product: { name: { contains: search, mode: 'insensitive' } },
                },
              },
              {
                actor: { fullName: { contains: search, mode: 'insensitive' } },
              },
              { actor: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: [
          { createdAt: query.sortOrder ?? 'desc' },
          { id: query.sortOrder ?? 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        select: movementSelect,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
  }

  adjustQuantity(
    branchId: string,
    variantId: string,
    actorId: string,
    dto: AdjustInventoryQuantityDto,
  ) {
    return this.runAdjustmentTransaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { code: true, isActive: true },
      });
      if (!branch?.isActive)
        throw new InventoryDomainError(
          'INVENTORY_BRANCH_INACTIVE',
          'Chi nhánh không tồn tại hoặc đã ngừng hoạt động',
        );
      const variant = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: {
          isActive: true,
          product: { select: { status: true } },
        },
      });
      if (!variant?.isActive || variant.product.status !== ProductStatus.ACTIVE)
        throw new InventoryDomainError(
          'INVENTORY_VARIANT_UNAVAILABLE',
          'Sản phẩm hoặc biến thể không còn khả dụng',
        );
      const current = await tx.branchProductStock.findUnique({
        where: { branchId_variantId: { branchId, variantId } },
        select: { id: true, quantity: true },
      });
      const beforeQuantity = current?.quantity ?? 0;
      if (beforeQuantity !== dto.expectedCurrentQuantity)
        throw new InventoryDomainError(
          'INVENTORY_QUANTITY_CHANGED',
          'Tồn kho đã thay đổi, vui lòng kiểm tra và xác nhận lại',
          { currentQuantity: beforeQuantity },
        );
      const quantityChange =
        dto.direction === InventoryAdjustmentDirection.INCREASE
          ? dto.quantity
          : -dto.quantity;
      const afterQuantity = beforeQuantity + quantityChange;
      if (afterQuantity < 0)
        throw new InventoryDomainError(
          'INVENTORY_QUANTITY_NEGATIVE',
          'Số lượng giảm không được vượt quá tồn hiện tại',
          { currentQuantity: beforeQuantity },
        );
      const now = new Date();
      const receiptId = ulid();
      const receiptCode = this.createAdjustmentCode(branch.code, now);
      await tx.stockReceipt.create({
        data: {
          id: receiptId,
          branchId,
          supplierId: null,
          code: receiptCode,
          type: StockReceiptType.ADJUSTMENT,
          status: StockReceiptStatus.CONFIRMED,
          note: dto.note,
          createdById: actorId,
          confirmedById: actorId,
          confirmedAt: now,
          items: {
            create: {
              variantId,
              quantity: quantityChange,
              costPrice: null,
            },
          },
        },
      });
      if (current) {
        const changed = await tx.branchProductStock.updateMany({
          where: { id: current.id, quantity: beforeQuantity },
          data: { quantity: { increment: quantityChange } },
        });
        if (changed.count !== 1)
          throw new InventoryDomainError(
            'INVENTORY_QUANTITY_CHANGED',
            'Tồn kho đã thay đổi, vui lòng kiểm tra và xác nhận lại',
          );
      } else {
        if (quantityChange < 0)
          throw new InventoryDomainError(
            'INVENTORY_QUANTITY_NEGATIVE',
            'Không thể giảm tồn khi chi nhánh chưa có tồn kho',
          );
        await tx.branchProductStock.create({
          data: { branchId, variantId, quantity: afterQuantity },
        });
      }
      const movement = await recordInventoryMovement(tx, {
        branchId,
        variantId,
        type: InventoryMovementType.MANUAL_ADJUSTMENT,
        quantityChange,
        beforeQuantity,
        afterQuantity,
        reason: dto.note,
        sourceType: InventoryMovementSourceType.DIRECT_ADJUSTMENT,
        sourceId: receiptId,
        sourceCode: receiptCode,
        actorId,
        receiptId,
      });
      return {
        variantId,
        beforeQuantity,
        quantityChange,
        afterQuantity,
        movementId: movement.id,
        receiptId,
        receiptCode,
      };
    });
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

  private createAdjustmentCode(branchCode: string, now: Date): string {
    const vietnamNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const month = `${vietnamNow.getUTCFullYear()}${String(
      vietnamNow.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    return `DCK-${branchCode}-${month}-${ulid().slice(-10)}`;
  }

  private async runAdjustmentTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(callback, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new InventoryDomainError(
      'INVENTORY_QUANTITY_CHANGED',
      'Tồn kho đã thay đổi, vui lòng kiểm tra và xác nhận lại',
    );
  }
}
