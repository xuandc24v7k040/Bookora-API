import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import type { Prisma, ProductVariant } from '@/generated/prisma/client';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import { activeFlashUsage } from './flash-sale-allocations';
import { flashDiscountPercent } from './flash-sale-pricing';
import type { FlashSaleOfferDto } from './flash-sales.dto';

@Injectable()
export class FlashSaleOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: StorefrontPriceService,
  ) {}

  async resolve(
    variant: ProductVariant,
    userId?: string,
    client: Prisma.TransactionClient = this.prisma,
    now = new Date(),
  ): Promise<FlashSaleOfferDto | null> {
    if (!variant.isActive) return null;
    const catalog = this.prices.resolve(variant, now).current;
    const item = await client.flashSaleItem.findFirst({
      where: {
        variantId: variant.id,
        flashPrice: { lt: catalog },
        flashSale: {
          state: 'PUBLISHED',
          startAt: { lte: now },
          endAt: { gt: now },
        },
        variant: { product: { status: 'ACTIVE' } },
      },
      include: { flashSale: true },
      orderBy: { id: 'asc' },
    });
    if (!item) return null;
    const used = await client.flashSaleAllocation.aggregate({
      where: { flashSaleItemId: item.id, ...activeFlashUsage(now) },
      _sum: { quantity: true },
    });
    const personal = userId
      ? await client.flashSaleAllocation.aggregate({
          where: { flashSaleItemId: item.id, userId, ...activeFlashUsage(now) },
          _sum: { quantity: true },
        })
      : null;
    const remaining = Math.max(0, item.totalQuota - (used._sum.quantity ?? 0));
    return {
      itemId: item.id,
      flashSaleId: item.flashSaleId,
      flashPrice: Number(item.flashPrice),
      catalogPrice: catalog,
      discountPercent: flashDiscountPercent(catalog, Number(item.flashPrice)),
      remaining,
      totalQuota: item.totalQuota,
      maxQuantityPerUser: item.maxQuantityPerUser,
      userRemaining: Math.max(
        0,
        Math.min(
          remaining,
          item.maxQuantityPerUser - (personal?._sum.quantity ?? 0),
        ),
      ),
      endAt: item.flashSale.endAt.toISOString(),
      serverNow: now.toISOString(),
    };
  }

  async eligibility(variantId: string, userId?: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    return { offer: variant ? await this.resolve(variant, userId) : null };
  }

  assertQuantity(
    offer: FlashSaleOfferDto,
    quantity: number,
    cartItemId: string,
  ): void {
    if (quantity <= offer.userRemaining) return;
    throw new ConflictException({
      code:
        offer.remaining < quantity
          ? 'FLASH_SALE_QUOTA_EXHAUSTED'
          : 'FLASH_SALE_USER_LIMIT',
      message:
        'Số lượng vượt số suất Flash Sale có thể mua. Vui lòng giảm số lượng hoặc chọn mua toàn bộ với giá thường.',
      details: {
        cartItemId,
        variantId: undefined,
        requestedQuantity: quantity,
        allowedQuantity: offer.userRemaining,
        catalogPrice: offer.catalogPrice,
      },
    });
  }

  /** Called inside the existing Serializable checkout transaction. Item locks serialize all buyers. */
  async revalidate(
    tx: Prisma.TransactionClient,
    userId: string,
    items: Array<{
      cartItemId: string;
      variantId: string;
      quantity: number;
      unitPrice: number;
      catalogEffectivePrice: number;
      flashSaleItemId: string | null;
      regularPrice: boolean;
    }>,
  ): Promise<void> {
    for (const item of [...items].sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    )) {
      const variant = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        include: { product: true },
      });
      if (item.flashSaleItemId) {
        const row = await tx.flashSaleItem.findUniqueOrThrow({
          where: { id: item.flashSaleItemId },
        });
        await tx.$queryRaw`SELECT id FROM flash_sales WHERE id = ${row.flashSaleId} FOR SHARE`;
        await tx.$queryRaw`SELECT id FROM flash_sale_items WHERE id = ${row.id} FOR UPDATE`;
      }
      const offer = variant ? await this.resolve(variant, userId, tx) : null;
      if (offer && !item.regularPrice)
        this.assertQuantity(offer, item.quantity, item.cartItemId);
      const applied =
        !item.regularPrice && offer && offer.userRemaining >= item.quantity
          ? offer
          : null;
      if (
        !variant ||
        variant.product.status !== 'ACTIVE' ||
        !variant.isActive ||
        this.prices.resolve(variant).current !== item.catalogEffectivePrice ||
        (applied?.itemId ?? null) !== item.flashSaleItemId ||
        (applied?.flashPrice ?? item.catalogEffectivePrice) !== item.unitPrice
      )
        throw new ConflictException({
          code: 'CHECKOUT_PREVIEW_CHANGED',
          message:
            'Giá hoặc ưu đãi đã thay đổi. Vui lòng xem và xác nhận lại đơn hàng.',
        });
    }
  }

  async allocate(
    tx: Prisma.TransactionClient,
    orderId: string,
    userId: string,
    expiresAt: Date | null,
  ): Promise<void> {
    const items = await tx.orderItem.findMany({
      where: { orderId, flashSaleItemId: { not: null } },
    });
    const now = new Date();
    for (const item of items)
      await tx.flashSaleAllocation.create({
        data: {
          flashSaleItemId: item.flashSaleItemId!,
          orderId,
          orderItemId: item.id,
          userId,
          quantity: item.quantity,
          status: expiresAt ? 'RESERVED' : 'CONSUMED',
          expiresAt,
          reservedAt: expiresAt ? now : null,
          consumedAt: expiresAt ? null : now,
        },
      });
  }
}
