import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  BranchContextService,
  type BranchContext,
} from '@/modules/authorization';
import { buildPaginationMeta } from '@/common/utils/pagination.util';
import {
  InventoryVariantOptionsQueryDto,
  type AdjustInventoryQuantityDto,
  type GroupedStockListQueryDto,
  type InventoryMovementListQueryDto,
  StockListQueryDto,
  StockState,
  UpdateLowStockThresholdDto,
} from './dto';
import {
  InventoryRepository,
  InventoryDomainError,
  type GroupedStockRecord,
  type InventoryMovementRecord,
  type StockRecord,
  type VariantOptionRecord,
} from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly branchContext: BranchContextService,
  ) {}

  async listVariantOptions(query: InventoryVariantOptionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [records, total] = await this.repository.listVariantOptions(
      query.search,
      (page - 1) * limit,
      limit,
    );
    return {
      data: records.map((record) => this.toVariantOption(record)),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async listStocks(context: BranchContext, query: StockListQueryDto) {
    const branchId = this.branchContext.requireSelectedBranch(context);
    const [records, total] = await this.repository.listStocks(branchId, query);
    return {
      data: records.map((record) => this.toStock(record)),
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 10),
    };
  }

  async listGroupedStocks(
    context: BranchContext,
    query: GroupedStockListQueryDto,
  ) {
    const branchId = this.branchContext.requireSelectedBranch(context);
    const [records, total] = await this.repository.listGroupedStocks(
      branchId,
      query,
    );
    return {
      data: records.map((record) => this.toGroupedStock(record)),
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 10),
    };
  }

  async listMovements(
    context: BranchContext,
    query: InventoryMovementListQueryDto,
  ) {
    const branchId = this.branchContext.requireSelectedBranch(context);
    const [records, total] = await this.repository.listMovements(
      branchId,
      query,
    );
    return {
      data: records.map((record) => this.toMovement(record)),
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  }

  async adjustQuantity(
    actor: AuthenticatedUser,
    context: BranchContext,
    variantId: string,
    dto: AdjustInventoryQuantityDto,
  ) {
    try {
      const branchId = this.branchContext.requireSelectedBranch(context);
      return await this.repository.adjustQuantity(
        branchId,
        variantId,
        actor.id,
        dto,
      );
    } catch (error) {
      if (error instanceof InventoryDomainError) {
        const body = {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        };
        if (error.code === 'INVENTORY_VARIANT_UNAVAILABLE')
          throw new NotFoundException(body);
        throw new ConflictException(body);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          code: 'INVENTORY_QUANTITY_CHANGED',
          message: 'Tồn kho đã thay đổi, vui lòng kiểm tra và xác nhận lại',
        });
      throw error;
    }
  }

  async updateThreshold(
    context: BranchContext,
    variantId: string,
    dto: UpdateLowStockThresholdDto,
  ) {
    const branchId = this.branchContext.requireSelectedBranch(context);
    const record = await this.repository.updateThreshold(
      branchId,
      variantId,
      dto.lowStockThreshold,
    );
    if (!record)
      throw new NotFoundException({
        code: 'STOCK_NOT_FOUND',
        message: 'Không tìm thấy tồn kho trong chi nhánh đang chọn',
      });
    return this.toStock(record);
  }

  private toVariantOption(record: VariantOptionRecord) {
    return {
      id: record.id,
      productId: record.productId,
      productName: record.product.name,
      variantName: record.name,
      sku: record.sku,
      barcode: record.barcode,
      isDefault: record.isDefault,
      isActive: record.isActive,
      productStatus: record.product.status,
      optionSummary: this.optionSummary(record),
      thumbnailUrl:
        record.media[0]?.url ?? record.product.media[0]?.url ?? null,
    };
  }

  private toStock(record: StockRecord) {
    return {
      variantId: record.variantId,
      productId: record.variant.productId,
      productName: record.variant.product.name,
      variantName: record.variant.name,
      optionSummary: this.optionSummary(record.variant),
      sku: record.variant.sku,
      barcode: record.variant.barcode,
      thumbnailUrl:
        record.variant.media[0]?.url ??
        record.variant.product.media[0]?.url ??
        null,
      quantity: record.quantity,
      lowStockThreshold: record.lowStockThreshold,
      stockState:
        record.quantity === 0
          ? StockState.OUT_OF_STOCK
          : record.quantity <= record.lowStockThreshold
            ? StockState.LOW_STOCK
            : StockState.IN_STOCK,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toGroupedStock(record: GroupedStockRecord) {
    const variants = record.variants.flatMap((variant) => {
      const stock = variant.stocks[0];
      if (!stock) return [];
      return [
        this.toStock({
          variantId: variant.id,
          quantity: stock.quantity,
          lowStockThreshold: stock.lowStockThreshold,
          updatedAt: stock.updatedAt,
          variant,
        }),
      ];
    });
    const totalQuantity = variants.reduce(
      (total, variant) => total + variant.quantity,
      0,
    );
    const stockState = variants.every(({ quantity }) => quantity === 0)
      ? StockState.OUT_OF_STOCK
      : variants.some(
            ({ quantity, lowStockThreshold }) => quantity <= lowStockThreshold,
          )
        ? StockState.LOW_STOCK
        : StockState.IN_STOCK;
    const updatedAt = variants.reduce(
      (latest, variant) =>
        variant.updatedAt > latest ? variant.updatedAt : latest,
      variants[0]?.updatedAt ?? new Date(0).toISOString(),
    );
    return {
      productId: record.id,
      productName: record.name,
      thumbnailUrl: record.media[0]?.url ?? variants[0]?.thumbnailUrl ?? null,
      isSimple:
        record.options.length === 0 &&
        variants.length === 1 &&
        record.variants[0]?.isDefault === true,
      variantCount: variants.length,
      totalQuantity,
      stockState,
      updatedAt,
      variants: variants.map((variant, index) => ({
        ...variant,
        isDefault: record.variants[index]?.isDefault ?? false,
      })),
    };
  }

  private toMovement(record: InventoryMovementRecord) {
    return {
      id: record.id,
      product: {
        id: record.variant.productId,
        name: record.variant.product.name,
        imageUrl:
          record.variant.media[0]?.url ??
          record.variant.product.media[0]?.url ??
          null,
      },
      variant: {
        id: record.variant.id,
        name: record.variant.name,
        sku: record.variant.sku,
        isDefault: record.variant.isDefault,
      },
      quantityChange: record.quantityChange,
      beforeQuantity: record.beforeQuantity,
      afterQuantity: record.afterQuantity,
      type: record.type,
      reason: record.reason,
      source: {
        type: record.sourceType,
        id: record.sourceId,
        code: record.sourceCode,
      },
      actor: record.actor
        ? {
            id: record.actor.id,
            name: record.actor.fullName?.trim() || record.actor.email,
            email: record.actor.email,
          }
        : null,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private optionSummary(record: VariantOptionRecord): string | null {
    const summary = record.optionValues
      .map((item) => `${item.option.name}: ${item.optionValue.label}`)
      .join(' · ');
    return summary || null;
  }
}
