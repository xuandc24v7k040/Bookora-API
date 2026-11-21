import { schedulePromotion } from '@/modules/notifications/notification-intents';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { Prisma } from '@/generated/prisma/client';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import { activeFlashUsage } from './flash-sale-allocations';
import {
  assertFlashPrice,
  flashDiscountPercent,
  flashSaleStatus,
  type FlashSaleStatus,
} from './flash-sale-pricing';
import type {
  FlashSaleControlDto,
  FlashSaleListQueryDto,
  FlashSaleResponseDto,
  SaveFlashSaleDto,
} from './flash-sales.dto';

const variantInclude = {
  product: {
    include: {
      media: {
        where: { type: 'IMAGE' as const, variantId: null },
        orderBy: [
          { isPrimary: 'desc' as const },
          { sortOrder: 'asc' as const },
        ],
        take: 1,
      },
    },
  },
  media: {
    where: { type: 'IMAGE' as const },
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    take: 1,
  },
  stocks: { where: { branch: { isActive: true } } },
} satisfies Prisma.ProductVariantInclude;
type VariantRecord = Prisma.ProductVariantGetPayload<{
  include: typeof variantInclude;
}>;
const saleInclude = {
  items: {
    include: { variant: { include: variantInclude } },
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.FlashSaleInclude;
type SaleRecord = Prisma.FlashSaleGetPayload<{ include: typeof saleInclude }>;

function statusWhere(
  status: FlashSaleStatus | undefined,
  now: Date,
): Prisma.FlashSaleWhereInput {
  if (!status) return {};
  if (status === 'ACTIVE')
    return { state: 'PUBLISHED', startAt: { lte: now }, endAt: { gt: now } };
  if (status === 'SCHEDULED')
    return { state: 'PUBLISHED', startAt: { gt: now } };
  if (status === 'ENDED') return { state: 'PUBLISHED', endAt: { lte: now } };
  return { state: status };
}

@Injectable()
export class FlashSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: StorefrontPriceService,
  ) {}

  private variantResponse(v: VariantRecord) {
    return {
      isSimple: v.isDefault && v.combinationKey.toUpperCase() === 'DEFAULT',
      variantId: v.id,
      productId: v.productId,
      productName: v.product.name,
      productSlug: v.product.slug,
      variantLabel: v.name,
      sku: v.sku,
      imageUrl: v.media[0]?.url ?? v.product.media[0]?.url ?? null,
      catalogPrice: this.prices.resolve(v).current,
      globalAvailableStock: v.stocks.reduce((sum, s) => sum + s.quantity, 0),
    };
  }

  private async response(
    sale: SaleRecord,
    client: Prisma.TransactionClient = this.prisma,
    now = new Date(),
  ): Promise<FlashSaleResponseDto> {
    const usage = await client.flashSaleAllocation.groupBy({
      by: ['flashSaleItemId', 'status'],
      where: {
        flashSaleItemId: { in: sale.items.map((i) => i.id) },
        ...activeFlashUsage(now),
      },
      _sum: { quantity: true },
    });
    return {
      id: sale.id,
      name: sale.name,
      description: sale.description,
      startAt: sale.startAt.toISOString(),
      endAt: sale.endAt.toISOString(),
      status: flashSaleStatus(sale, now),
      serverNow: now.toISOString(),
      controlReason: sale.controlReason,
      itemCount: sale.items.length,
      items: sale.items.map((item) => {
        const consumed =
          usage.find(
            (u) => u.flashSaleItemId === item.id && u.status === 'CONSUMED',
          )?._sum.quantity ?? 0;
        const reserved =
          usage.find(
            (u) => u.flashSaleItemId === item.id && u.status === 'RESERVED',
          )?._sum.quantity ?? 0;
        const variant = this.variantResponse(item.variant);
        return {
          ...variant,
          id: item.id,
          flashPrice: Number(item.flashPrice),
          referencePrice: Number(item.referencePrice),
          discountPercent: flashDiscountPercent(
            variant.catalogPrice,
            Number(item.flashPrice),
          ),
          totalQuota: item.totalQuota,
          maxQuantityPerUser: item.maxQuantityPerUser,
          consumed,
          reserved,
          remaining: Math.max(0, item.totalQuota - consumed - reserved),
        };
      }),
    };
  }

  async list(query: FlashSaleListQueryDto, publicOnly = false) {
    const now = new Date();
    const page = query.page ?? 1,
      limit = query.limit ?? 10;
    const where: Prisma.FlashSaleWhereInput = {
      AND: [
        statusWhere(query.status, now),
        ...(publicOnly
          ? [
              {
                state: 'PUBLISHED' as const,
                endAt: { gt: now },
                items: {
                  some: {
                    variant: {
                      isActive: true,
                      product: { status: 'ACTIVE' as const },
                    },
                  },
                },
              },
            ]
          : []),
      ],
      ...(query.search
        ? { name: { contains: query.search.trim(), mode: 'insensitive' } }
        : {}),
    };
    const [rows, totalItems] = await Promise.all([
      this.prisma.flashSale.findMany({
        where,
        orderBy: [
          {
            [query.sortBy ?? (publicOnly ? 'endAt' : 'createdAt')]:
              query.sortOrder ?? (publicOnly ? 'asc' : 'desc'),
          },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: saleInclude,
      }),
      this.prisma.flashSale.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async (sale) => {
        if (publicOnly)
          sale.items = sale.items.filter(
            (i) => i.variant.isActive && i.variant.product.status === 'ACTIVE',
          );
        const result = await this.response(sale, this.prisma, now);
        return publicOnly ? { ...result, controlReason: null } : result;
      }),
    );
    return {
      items,
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    };
  }

  async variants(query: FlashSaleListQueryDto) {
    const page = query.page ?? 1,
      limit = query.limit ?? 10;
    const where: Prisma.ProductVariantWhereInput = {
      isActive: true,
      product: { status: 'ACTIVE' },
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              {
                product: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, totalItems] = await Promise.all([
      this.prisma.productVariant.findMany({
        where,
        include: variantInclude,
        orderBy: [{ productId: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productVariant.count({ where }),
    ]);
    return {
      items: rows.map((v) => this.variantResponse(v)),
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    };
  }

  async detail(id: string) {
    const sale = await this.prisma.flashSale.findUnique({
      where: { id },
      include: saleInclude,
    });
    if (!sale)
      throw new NotFoundException({
        code: 'FLASH_SALE_NOT_FOUND',
        message: 'Không tìm thấy chương trình Flash Sale.',
      });
    return this.response(sale);
  }

  private async validateItems(
    tx: Prisma.TransactionClient,
    dto: SaveFlashSaleDto,
    id?: string,
    publish = false,
  ) {
    if (new Set(dto.items.map((i) => i.variantId)).size !== dto.items.length)
      throw new BadRequestException({
        code: 'FLASH_SALE_INVALID',
        message: 'Không được chọn trùng biến thể.',
      });
    const startAt = new Date(dto.startAt),
      endAt = new Date(dto.endAt);
    if (!(startAt < endAt) || endAt <= new Date())
      throw new BadRequestException({
        code: 'FLASH_SALE_INVALID',
        message:
          'Thời gian kết thúc phải sau bắt đầu và sau thời điểm hiện tại.',
      });
    const items: Array<Prisma.FlashSaleItemCreateManyFlashSaleInput> = [];
    for (const item of [...dto.items].sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    )) {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${item.variantId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM branch_product_stocks WHERE variant_id = ${item.variantId} ORDER BY id FOR UPDATE`;
      const variant = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        include: variantInclude,
      });
      if (!variant?.isActive || variant.product.status !== 'ACTIVE')
        throw new BadRequestException({
          code: 'FLASH_SALE_INVALID',
          message: 'Biến thể hoặc sản phẩm không còn được kinh doanh.',
        });
      const data = this.variantResponse(variant);
      assertFlashPrice(item.flashPrice, data.catalogPrice);
      if (item.totalQuota > data.globalAvailableStock)
        throw new BadRequestException({
          code: 'FLASH_SALE_QUOTA_EXCEEDS_STOCK',
          message: `Quota Flash Sale không được vượt quá tổng tồn kho khả dụng. ${data.productName} hiện có ${data.globalAvailableStock} sản phẩm toàn hệ thống.`,
        });
      if (item.maxQuantityPerUser > item.totalQuota)
        throw new BadRequestException({
          code: 'FLASH_SALE_INVALID',
          message: 'Giới hạn mỗi khách không được vượt quota.',
        });
      if (
        publish &&
        (await tx.flashSaleItem.count({
          where: {
            variantId: item.variantId,
            flashSaleId: id ? { not: id } : undefined,
            flashSale: {
              state: 'PUBLISHED',
              startAt: { lt: endAt },
              endAt: { gt: startAt },
            },
          },
        }))
      )
        throw new ConflictException({
          code: 'FLASH_SALE_VARIANT_CONFLICT',
          message: `Biến thể ${data.productName} đã có Flash Sale trùng thời gian.`,
        });
      items.push({ ...item, referencePrice: data.catalogPrice });
    }
    return { items, startAt, endAt };
  }

  async save(dto: SaveFlashSaleDto, actorId: string, id?: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      if (id) {
        await tx.$queryRaw`SELECT id FROM flash_sales WHERE id = ${id} FOR UPDATE`;
        const sale = await tx.flashSale.findUnique({ where: { id } });
        if (!sale)
          throw new NotFoundException({
            code: 'FLASH_SALE_NOT_FOUND',
            message: 'Không tìm thấy Flash Sale.',
          });
        if (sale.state !== 'DRAFT')
          throw new ConflictException({
            code: 'FLASH_SALE_HISTORY_LOCKED',
            message: 'Chỉ được chỉnh sửa chương trình bản nháp.',
          });
      }
      const { items, startAt, endAt } = await this.validateItems(tx, dto, id);
      if (id) await tx.flashSaleItem.deleteMany({ where: { flashSaleId: id } });
      const data = {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        startAt,
        endAt,
        items: { create: items },
      };
      const sale = id
        ? await tx.flashSale.update({
            where: { id },
            data,
            include: saleInclude,
          })
        : await tx.flashSale.create({
            data: { ...data, createdById: actorId },
            include: saleInclude,
          });
      return this.response(sale, tx);
    });
  }

  async control(id: string, dto: FlashSaleControlDto, actorId: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM flash_sales WHERE id = ${id} FOR UPDATE`;
      const sale = await tx.flashSale.findUnique({
        where: { id },
        include: saleInclude,
      });
      if (!sale)
        throw new NotFoundException({
          code: 'FLASH_SALE_NOT_FOUND',
          message: 'Không tìm thấy Flash Sale.',
        });
      const now = new Date(),
        status = flashSaleStatus(sale, now);
      if (dto.action === 'publish' && status === 'DRAFT') {
        await this.validateItems(
          tx,
          {
            name: sale.name,
            startAt: sale.startAt.toISOString(),
            endAt: sale.endAt.toISOString(),
            items: sale.items.map((i) => ({
              variantId: i.variantId,
              flashPrice: Number(i.flashPrice),
              totalQuota: i.totalQuota,
              maxQuantityPerUser: i.maxQuantityPerUser,
            })),
          },
          id,
          true,
        );
      } else if (
        !(dto.action === 'cancel' && ['DRAFT', 'SCHEDULED'].includes(status)) &&
        !(dto.action === 'stop' && status === 'ACTIVE')
      )
        throw new ConflictException({
          code: 'FLASH_SALE_HISTORY_LOCKED',
          message:
            'Thao tác không phù hợp với trạng thái chương trình hiện tại.',
        });
      const updated = await tx.flashSale.update({
        where: { id },
        data: {
          state:
            dto.action === 'publish'
              ? 'PUBLISHED'
              : dto.action === 'stop'
                ? 'STOPPED_EARLY'
                : 'CANCELLED',
          publishedAt: dto.action === 'publish' ? now : sale.publishedAt,
          stoppedAt: dto.action === 'stop' ? now : null,
          controlledById: actorId,
          controlReason: dto.reason?.trim() || null,
        },
        include: saleInclude,
      });
      if (dto.action === 'publish')
        await schedulePromotion(
          tx,
          'FLASH_SALE_ACTIVE',
          updated.id,
          updated.startAt,
          true,
        );
      return this.response(updated, tx, now);
    });
  }
}
