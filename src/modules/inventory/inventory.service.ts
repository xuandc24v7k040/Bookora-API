import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BranchContextService,
  type BranchContext,
} from '@/modules/authorization';
import { buildPaginationMeta } from '@/common/utils/pagination.util';
import {
  InventoryVariantOptionsQueryDto,
  StockListQueryDto,
  StockState,
  UpdateLowStockThresholdDto,
} from './dto';
import {
  InventoryRepository,
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

  private optionSummary(record: VariantOptionRecord): string | null {
    const summary = record.optionValues
      .map((item) => `${item.option.name}: ${item.optionValue.label}`)
      .join(' · ');
    return summary || null;
  }
}
