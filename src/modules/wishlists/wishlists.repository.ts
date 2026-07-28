import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductMediaType,
  ProductStatus,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { publicProductVisibilityWhere } from '@/modules/storefront-catalog/storefront-catalog.repository';

const wishlistProductSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  authors: {
    orderBy: { author: { name: 'asc' as const } },
    select: { author: { select: { name: true } } },
  },
  media: {
    where: { variantId: null, type: ProductMediaType.IMAGE },
    orderBy: [
      { isPrimary: 'desc' as const },
      { sortOrder: 'asc' as const },
      { id: 'asc' as const },
    ],
    take: 1,
    select: { url: true },
  },
  variants: {
    where: { isActive: true },
    orderBy: [
      { isDefault: 'desc' as const },
      { name: 'asc' as const },
      { id: 'asc' as const },
    ],
    take: 1,
    select: {
      originalPrice: true,
      salePrice: true,
      saleStartAt: true,
      saleEndAt: true,
      isDefault: true,
    },
  },
} satisfies Prisma.ProductSelect;

export const wishlistItemInclude = {
  product: { select: wishlistProductSelect },
} satisfies Prisma.WishlistInclude;

export type WishlistItemRecord = Prisma.WishlistGetPayload<{
  include: typeof wishlistItemInclude;
}>;

@Injectable()
export class WishlistsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublicProduct(productId: string) {
    return this.prisma.product.findFirst({
      where: { ...publicProductVisibilityWhere, id: productId },
      select: { id: true },
    });
  }

  upsert(userId: string, productId: string) {
    return this.prisma.wishlist.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
      select: { id: true },
    });
  }

  remove(userId: string, productId: string) {
    return this.prisma.wishlist.deleteMany({ where: { userId, productId } });
  }

  status(userId: string, productIds: string[]) {
    return this.prisma.wishlist.findMany({
      where: { userId, productId: { in: productIds } },
      select: { productId: true },
    });
  }

  async list(userId: string, page: number, limit: number) {
    const where: Prisma.WishlistWhereInput = { userId };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.wishlist.findMany({
        where,
        include: wishlistItemInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.wishlist.count({ where }),
    ]);
    return { items, totalItems };
  }

  latest(userId: string, limit: number) {
    return this.prisma.wishlist.findMany({
      where: { userId },
      include: wishlistItemInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  async ratingAggregates(productIds: string[]) {
    if (!productIds.length)
      return new Map<
        string,
        { averageRating: number | null; reviewCount: number }
      >();
    const rows = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, isVisible: true },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return new Map(
      rows.map((row) => [
        row.productId,
        {
          averageRating:
            row._avg.rating === null
              ? null
              : Number(row._avg.rating.toFixed(2)),
          reviewCount: row._count._all,
        },
      ]),
    );
  }

  isProductAvailable(record: WishlistItemRecord['product']): boolean {
    return record.status === ProductStatus.ACTIVE && record.variants.length > 0;
  }
}
