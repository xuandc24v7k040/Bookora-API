import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import {
  BranchContextService,
  type BranchContext,
} from '@/modules/authorization';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { buildPaginationMeta } from '@/common/utils/pagination.util';
import type {
  CreateStockReceiptDto,
  StockReceiptListQueryDto,
  UpdateStockReceiptDraftDto,
} from './dto';
import {
  StockReceiptDomainError,
  StockReceiptsRepository,
  type StockReceiptRecord,
} from './stock-receipts.repository';

@Injectable()
export class StockReceiptsService {
  constructor(
    private readonly repository: StockReceiptsRepository,
    private readonly branchContext: BranchContextService,
  ) {}

  async list(context: BranchContext, query: StockReceiptListQueryDto) {
    const branchId = this.branchContext.requireSelectedBranch(context);
    const [records, total] = await this.repository.list(branchId, query);
    return {
      data: records.map((record) => this.toListItem(record)),
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 10),
    };
  }

  async get(context: BranchContext, id: string) {
    const branchId = this.branchContext.requireSelectedBranch(context);
    const record = await this.repository.findById(branchId, id);
    if (!record) this.notFound();
    return this.toDetail(record);
  }

  create(
    actor: AuthenticatedUser,
    context: BranchContext,
    dto: CreateStockReceiptDto,
  ) {
    return this.execute(async () => {
      const branchId = this.branchContext.requireSelectedBranch(context);
      return this.toDetail(
        await this.repository.create(branchId, actor.id, dto),
      );
    });
  }

  update(context: BranchContext, id: string, dto: UpdateStockReceiptDraftDto) {
    return this.execute(async () => {
      const branchId = this.branchContext.requireSelectedBranch(context);
      return this.toDetail(
        await this.repository.updateDraft(branchId, id, dto),
      );
    });
  }

  cancel(context: BranchContext, id: string) {
    return this.execute(async () => {
      const branchId = this.branchContext.requireSelectedBranch(context);
      return this.toDetail(await this.repository.cancel(branchId, id));
    });
  }

  confirm(actor: AuthenticatedUser, context: BranchContext, id: string) {
    return this.execute(async () => {
      const branchId = this.branchContext.requireSelectedBranch(context);
      return this.toDetail(
        await this.repository.confirm(branchId, id, actor.id),
      );
    });
  }

  private toListItem(record: StockReceiptRecord) {
    const totals = this.totals(record);
    return {
      id: record.id,
      code: record.code,
      supplier: record.supplier,
      status: record.status,
      ...totals,
      createdBy: this.user(record.createdBy),
      createdAt: record.createdAt.toISOString(),
      confirmedBy: this.user(record.confirmedBy),
      confirmedAt: record.confirmedAt?.toISOString() ?? null,
    };
  }

  private toDetail(record: StockReceiptRecord) {
    return {
      ...this.toListItem(record),
      branch: { id: record.branch.id, name: record.branch.name },
      note: record.note,
      items: record.items.map((item) => {
        const optionSummary = item.variant.optionValues
          .map((value) => `${value.option.name}: ${value.optionValue.label}`)
          .join(' · ');
        return {
          id: item.id,
          variantId: item.variantId,
          productId: item.variant.productId,
          productName: item.variant.product.name,
          variantName: item.variant.name,
          sku: item.variant.sku,
          barcode: item.variant.barcode,
          optionSummary: optionSummary || null,
          thumbnailUrl:
            item.variant.media[0]?.url ??
            item.variant.product.media[0]?.url ??
            null,
          variantActive: item.variant.isActive,
          productStatus: item.variant.product.status,
          quantity: item.quantity,
          costPrice: item.costPrice?.toFixed(2) ?? null,
          lineTotal: item.costPrice
            ? item.costPrice.mul(item.quantity).toFixed(2)
            : null,
        };
      }),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private totals(record: StockReceiptRecord) {
    const totalCost = record.items.reduce(
      (total, item) =>
        item.costPrice ? total.add(item.costPrice.mul(item.quantity)) : total,
      new Prisma.Decimal(0),
    );
    return {
      itemCount: record.items.length,
      totalQuantity: record.items.reduce(
        (total, item) => total + item.quantity,
        0,
      ),
      totalCostAmount: totalCost.toFixed(2),
    };
  }

  private user(
    user: StockReceiptRecord['createdBy'],
  ): { id: string; name: string } | null {
    return user
      ? { id: user.id, name: user.fullName?.trim() || user.email }
      : null;
  }

  private async execute<T>(callback: () => Promise<T>): Promise<T> {
    try {
      return await callback();
    } catch (error) {
      if (error instanceof StockReceiptDomainError) {
        const body = {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        };
        if (error.code === 'STOCK_RECEIPT_NOT_FOUND')
          throw new NotFoundException(body);
        throw new ConflictException(body);
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          code: 'STOCK_RECEIPT_CONCURRENT_UPDATE',
          message: 'Mã phiếu vừa bị trùng, vui lòng thử lại',
        });
      throw error;
    }
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'STOCK_RECEIPT_NOT_FOUND',
      message: 'Không tìm thấy phiếu nhập trong chi nhánh đang chọn',
    });
  }
}
