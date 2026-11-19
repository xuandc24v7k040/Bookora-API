import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { activeFlashUsage } from '@/modules/flash-sales/flash-sale-allocations';

/** Read-only estimates. Checkout still revalidates and allocates atomically. */
@Injectable()
export class CartFlashPriceService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(variantIds: string[], userId: string) {
    const result = new Map<string, { price: number; allowed: number }>();
    if (!variantIds.length) return result;
    const now = new Date();
    const items = await this.prisma.flashSaleItem.findMany({
      where: {
        variantId: { in: variantIds },
        variant: { isActive: true, product: { status: 'ACTIVE' } },
        flashSale: {
          state: 'PUBLISHED',
          startAt: { lte: now },
          endAt: { gt: now },
        },
      },
      orderBy: { id: 'asc' },
    });
    if (!items.length) return result;
    const where = {
      flashSaleItemId: { in: items.map((i) => i.id) },
      ...activeFlashUsage(now),
    };
    const [used, personal] = await Promise.all([
      this.prisma.flashSaleAllocation.groupBy({
        by: ['flashSaleItemId'],
        where,
        _sum: { quantity: true },
      }),
      this.prisma.flashSaleAllocation.groupBy({
        by: ['flashSaleItemId'],
        where: { ...where, userId },
        _sum: { quantity: true },
      }),
    ]);
    const totals = new Map(
      used.map((i) => [i.flashSaleItemId, i._sum.quantity ?? 0]),
    );
    const own = new Map(
      personal.map((i) => [i.flashSaleItemId, i._sum.quantity ?? 0]),
    );
    for (const item of items) {
      if (result.has(item.variantId)) continue;
      result.set(item.variantId, {
        price: Number(item.flashPrice),
        allowed: Math.max(
          0,
          Math.min(
            item.totalQuota - (totals.get(item.id) ?? 0),
            item.maxQuantityPerUser - (own.get(item.id) ?? 0),
          ),
        ),
      });
    }
    return result;
  }
}
