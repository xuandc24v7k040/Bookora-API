import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import type { WishlistListQueryDto } from './dto';
import {
  type WishlistItemRecord,
  WishlistsRepository,
} from './wishlists.repository';

@Injectable()
export class WishlistsService {
  constructor(
    private readonly repository: WishlistsRepository,
    private readonly prices: StorefrontPriceService,
  ) {}

  async add(actor: AuthenticatedUser, productId: string) {
    this.assertCustomer(actor);
    if (!(await this.repository.findPublicProduct(productId))) {
      throw new NotFoundException({
        code: 'WISHLIST_PRODUCT_NOT_FOUND',
        message: 'Sản phẩm không còn khả dụng để lưu yêu thích.',
      });
    }
    await this.repository.upsert(actor.id, productId);
    return { productId, isWishlisted: true };
  }

  async remove(actor: AuthenticatedUser, productId: string) {
    this.assertCustomer(actor);
    await this.repository.remove(actor.id, productId);
    return { productId, isWishlisted: false };
  }

  async status(actor: AuthenticatedUser, productIds: string[]) {
    this.assertCustomer(actor);
    const uniqueProductIds = [...new Set(productIds)];
    const items = await this.repository.status(actor.id, uniqueProductIds);
    return { wishlistedProductIds: items.map((item) => item.productId) };
  }

  async list(actor: AuthenticatedUser, query: WishlistListQueryDto) {
    this.assertCustomer(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const result = await this.repository.list(actor.id, page, limit);
    const aggregates = await this.repository.ratingAggregates(
      result.items.map((item) => item.productId),
    );
    return {
      items: result.items.map((item) => this.toItem(item, aggregates)),
      page,
      limit,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / limit)),
    };
  }

  async latest(actor: AuthenticatedUser, limit = 4) {
    this.assertCustomer(actor);
    const items = await this.repository.latest(actor.id, limit);
    const aggregates = await this.repository.ratingAggregates(
      items.map((item) => item.productId),
    );
    return items.map((item) => this.toItem(item, aggregates));
  }

  private toItem(
    item: WishlistItemRecord,
    aggregates: Map<
      string,
      { averageRating: number | null; reviewCount: number }
    >,
  ) {
    const variant = item.product.variants[0];
    const rating = aggregates.get(item.productId) ?? {
      averageRating: null,
      reviewCount: 0,
    };
    return {
      id: item.id,
      createdAt: item.createdAt.toISOString(),
      product: {
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        authors: item.product.authors.map(({ author }) => author.name),
        imageUrl: item.product.media[0]?.url ?? null,
        price: variant
          ? this.prices.resolve(variant, new Date())
          : {
              current: null,
              original: null,
              onSale: false,
              discountPercent: 0,
            },
        isAvailable: this.repository.isProductAvailable(item.product),
        ...rating,
      },
    };
  }

  private assertCustomer(actor: AuthenticatedUser): void {
    if (actor.type !== UserType.CUSTOMER) {
      throw new ForbiddenException({
        code: 'WISHLIST_FORBIDDEN',
        message: 'Chỉ khách hàng được sử dụng danh sách yêu thích.',
      });
    }
  }
}
