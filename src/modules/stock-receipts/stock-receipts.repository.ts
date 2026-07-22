import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import {
  Prisma,
  ProductStatus,
  StockReceiptStatus,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import {
  startOfNextVietnamDate,
  startOfVietnamDate,
} from '@/common/utils/master-data.util';
import { variantPresentationSelect } from '@/modules/inventory/inventory.repository';
import type {
  CreateStockReceiptDto,
  StockReceiptItemInputDto,
  StockReceiptListQueryDto,
  UpdateStockReceiptDraftDto,
} from './dto';

const userSummarySelect = {
  id: true,
  fullName: true,
  email: true,
} as const;

export const receiptSelect = {
  id: true,
  branchId: true,
  supplierId: true,
  code: true,
  status: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  confirmedAt: true,
  branch: { select: { id: true, name: true, code: true, isActive: true } },
  supplier: { select: { id: true, name: true } },
  createdBy: { select: userSummarySelect },
  confirmedBy: { select: userSummarySelect },
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      variantId: true,
      quantity: true,
      costPrice: true,
      variant: { select: variantPresentationSelect },
    },
  },
} satisfies Prisma.StockReceiptSelect;

export type StockReceiptRecord = Prisma.StockReceiptGetPayload<{
  select: typeof receiptSelect;
}>;

export class StockReceiptDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

@Injectable()
export class StockReceiptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(branchId: string, query: StockReceiptListQueryDto) {
    const where: Prisma.StockReceiptWhereInput = {
      branchId,
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              {
                supplier: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom
                ? { gte: startOfVietnamDate(query.createdFrom) }
                : {}),
              ...(query.createdTo
                ? { lt: startOfNextVietnamDate(query.createdTo) }
                : {}),
            },
          }
        : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';
    return Promise.all([
      this.prisma.stockReceipt.findMany({
        where,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: receiptSelect,
      }),
      this.prisma.stockReceipt.count({ where }),
    ]);
  }

  findById(branchId: string, id: string) {
    return this.prisma.stockReceipt.findFirst({
      where: { id, branchId },
      select: receiptSelect,
    });
  }

  create(branchId: string, actorId: string, dto: CreateStockReceiptDto) {
    return this.runTransaction(async (tx) => {
      const branch = await this.requireActiveBranch(tx, branchId);
      await this.requireSupplier(tx, dto.supplierId);
      const items = dto.items ?? [];
      await this.requireAvailableVariants(tx, items);
      return tx.stockReceipt.create({
        data: {
          branchId,
          supplierId: dto.supplierId ?? null,
          code: this.createCode(branch.code),
          note: dto.note ?? null,
          createdById: actorId,
          items: {
            create: items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              costPrice: item.costPrice ?? null,
            })),
          },
        },
        select: receiptSelect,
      });
    });
  }

  updateDraft(branchId: string, id: string, dto: UpdateStockReceiptDraftDto) {
    return this.runTransaction(async (tx) => {
      const current = await this.requireReceipt(tx, branchId, id);
      this.requireDraft(current.status);
      await this.requireSupplier(tx, dto.supplierId);
      if (dto.items) await this.requireAvailableVariants(tx, dto.items);
      return tx.stockReceipt.update({
        where: { id },
        data: {
          ...(dto.supplierId !== undefined
            ? { supplierId: dto.supplierId }
            : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          ...(dto.items !== undefined
            ? {
                items: {
                  deleteMany: {},
                  create: dto.items.map((item) => ({
                    variantId: item.variantId,
                    quantity: item.quantity,
                    costPrice: item.costPrice ?? null,
                  })),
                },
              }
            : {}),
        },
        select: receiptSelect,
      });
    });
  }

  cancel(branchId: string, id: string) {
    return this.runTransaction(async (tx) => {
      const current = await this.requireReceipt(tx, branchId, id);
      this.requireDraft(current.status);
      return tx.stockReceipt.update({
        where: { id },
        data: { status: StockReceiptStatus.CANCELLED },
        select: receiptSelect,
      });
    });
  }

  confirm(branchId: string, id: string, actorId: string) {
    return this.runTransaction(async (tx) => {
      const receipt = await this.requireReceipt(tx, branchId, id);
      this.requireDraft(receipt.status);
      if (!receipt.branch.isActive)
        throw new StockReceiptDomainError(
          'STOCK_RECEIPT_BRANCH_INACTIVE',
          'Chi nhánh của phiếu nhập đã ngừng hoạt động',
        );
      await this.requireSupplier(tx, receipt.supplierId);
      if (receipt.items.length === 0)
        throw new StockReceiptDomainError(
          'STOCK_RECEIPT_ITEMS_REQUIRED',
          'Phiếu nhập cần có ít nhất một sản phẩm trước khi xác nhận',
        );
      this.assertReceiptItemsAvailable(receipt);

      const transitioned = await tx.stockReceipt.updateMany({
        where: { id, branchId, status: StockReceiptStatus.DRAFT },
        data: {
          status: StockReceiptStatus.CONFIRMED,
          confirmedById: actorId,
          confirmedAt: new Date(),
        },
      });
      if (transitioned.count !== 1)
        throw new StockReceiptDomainError(
          'STOCK_RECEIPT_ALREADY_CONFIRMED',
          'Phiếu nhập đã được xác nhận trước đó',
        );

      for (const item of receipt.items) {
        await tx.branchProductStock.upsert({
          where: {
            branchId_variantId: { branchId, variantId: item.variantId },
          },
          create: {
            branchId,
            variantId: item.variantId,
            quantity: item.quantity,
          },
          update: { quantity: { increment: item.quantity } },
        });
      }

      return tx.stockReceipt.findUniqueOrThrow({
        where: { id },
        select: receiptSelect,
      });
    });
  }

  private async requireReceipt(
    tx: Prisma.TransactionClient,
    branchId: string,
    id: string,
  ) {
    const receipt = await tx.stockReceipt.findFirst({
      where: { id, branchId },
      select: receiptSelect,
    });
    if (!receipt)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_NOT_FOUND',
        'Không tìm thấy phiếu nhập trong chi nhánh đang chọn',
      );
    return receipt;
  }

  private requireDraft(status: StockReceiptStatus): void {
    if (status === StockReceiptStatus.CONFIRMED)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_ALREADY_CONFIRMED',
        'Phiếu nhập đã được xác nhận trước đó',
      );
    if (status === StockReceiptStatus.CANCELLED)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_CANCELLED',
        'Phiếu nhập đã bị hủy',
      );
  }

  private async requireActiveBranch(
    tx: Prisma.TransactionClient,
    branchId: string,
  ) {
    const branch = await tx.branch.findUnique({
      where: { id: branchId },
      select: { id: true, code: true, isActive: true },
    });
    if (!branch || !branch.isActive)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_BRANCH_INACTIVE',
        'Chi nhánh không tồn tại hoặc đã ngừng hoạt động',
      );
    return branch;
  }

  private async requireSupplier(
    tx: Prisma.TransactionClient,
    supplierId: string | null | undefined,
  ): Promise<void> {
    if (!supplierId) return;
    const supplier = await tx.supplier.count({ where: { id: supplierId } });
    if (supplier !== 1)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_SUPPLIER_INVALID',
        'Nhà cung cấp đã chọn không còn hợp lệ',
      );
  }

  private async requireAvailableVariants(
    tx: Prisma.TransactionClient,
    items: StockReceiptItemInputDto[],
  ): Promise<void> {
    const ids = items.map((item) => item.variantId);
    if (new Set(ids).size !== ids.length)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_VARIANT_DUPLICATED',
        'Sản phẩm hoặc biến thể này đã có trong phiếu nhập',
      );
    if (ids.length === 0) return;
    const variants = await tx.productVariant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        isActive: true,
        product: { select: { status: true } },
      },
    });
    if (variants.length !== ids.length)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_VARIANT_INACTIVE',
        'Một biến thể trong phiếu không tồn tại hoặc đã ngừng hoạt động',
      );
    const inactive = variants.find((variant) => !variant.isActive);
    if (inactive)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_VARIANT_INACTIVE',
        'Một biến thể trong phiếu đã ngừng hoạt động',
        { variantId: inactive.id },
      );
    const unavailable = variants.find(
      (variant) => variant.product.status !== ProductStatus.ACTIVE,
    );
    if (unavailable)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_PRODUCT_UNAVAILABLE',
        'Một sản phẩm trong phiếu không còn ở trạng thái có thể kinh doanh',
        { variantId: unavailable.id },
      );
  }

  private assertReceiptItemsAvailable(receipt: StockReceiptRecord): void {
    const inactive = receipt.items.find((item) => !item.variant.isActive);
    if (inactive)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_VARIANT_INACTIVE',
        'Một biến thể trong phiếu đã ngừng hoạt động',
        { variantId: inactive.variantId },
      );
    const unavailable = receipt.items.find(
      (item) => item.variant.product.status !== ProductStatus.ACTIVE,
    );
    if (unavailable)
      throw new StockReceiptDomainError(
        'STOCK_RECEIPT_PRODUCT_UNAVAILABLE',
        'Một sản phẩm trong phiếu không còn ở trạng thái có thể kinh doanh',
        { variantId: unavailable.variantId },
      );
  }

  private createCode(branchCode: string): string {
    const vietnamNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const month = `${vietnamNow.getUTCFullYear()}${String(
      vietnamNow.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    return `PNK-${branchCode}-${month}-${ulid().slice(-10)}`;
  }

  private async runTransaction<T>(
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
        if (!retryable || attempt === 3) {
          if (retryable)
            throw new StockReceiptDomainError(
              'STOCK_RECEIPT_CONCURRENT_UPDATE',
              'Dữ liệu phiếu nhập vừa thay đổi, vui lòng tải lại và thử lại',
            );
          throw error;
        }
      }
    }
    throw new StockReceiptDomainError(
      'STOCK_RECEIPT_CONCURRENT_UPDATE',
      'Dữ liệu phiếu nhập vừa thay đổi, vui lòng tải lại và thử lại',
    );
  }
}
