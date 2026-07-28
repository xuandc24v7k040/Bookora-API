import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type {
  AdminReviewListQueryDto,
  CreateReviewDto,
  CustomerReviewListQueryDto,
  PendingReviewQueryDto,
  PublicReviewQueryDto,
  UpdateReviewDto,
} from './dto';
import {
  type AdminReviewRecord,
  type CustomerReviewRecord,
  ReviewsRepository,
} from './reviews.repository';

@Injectable()
export class ReviewsService {
  constructor(private readonly repository: ReviewsRepository) {}

  async publicList(productId: string, query: PublicReviewQueryDto) {
    if (!(await this.repository.findPublicProduct(productId))) {
      throw new NotFoundException({
        code: 'PUBLIC_PRODUCT_NOT_FOUND',
        message: 'Không tìm thấy sản phẩm hoặc sản phẩm đã ngừng kinh doanh.',
      });
    }
    const page = query.page ?? 1;
    const { items, totalItems, aggregate, distribution, pageSize } =
      await this.repository.listPublic(productId, query);
    const reviewCount = aggregate._count._all;
    const countsByRating = new Map(
      distribution.map((item) => [item.rating, item._count._all]),
    );
    return {
      items: items.map((item) => ({
        id: item.id,
        reviewer: {
          displayName: item.user.fullName?.trim() || 'Khách hàng Bookora',
          avatarUrl: item.user.avatarUrl,
        },
        rating: item.rating,
        content: item.content,
        verifiedPurchase: true,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      averageRating:
        aggregate._avg.rating === null
          ? null
          : Number(aggregate._avg.rating.toFixed(2)),
      reviewCount,
      ratingDistribution: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: countsByRating.get(rating) ?? 0,
      })),
    };
  }

  async mine(actor: AuthenticatedUser, query: CustomerReviewListQueryDto) {
    this.assertCustomer(actor);
    await this.assertOwnedOrderFilter(actor.id, query.orderId);
    const result = await this.repository.listMine(actor.id, query);
    return {
      items: result.items.map((item) => this.toCustomer(item)),
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / result.limit)),
    };
  }

  async pending(actor: AuthenticatedUser, query: PendingReviewQueryDto) {
    this.assertCustomer(actor);
    await this.assertOwnedOrderFilter(actor.id, query.orderId);
    const result = await this.repository.listPending(actor.id, query);
    return {
      items: result.items.map((item) => ({
        orderId: item.orderId,
        orderCode: item.orderCode,
        product: {
          id: item.productId,
          name: item.productName,
          slug: item.productSlug,
          imageUrl: item.imageUrl,
        },
        completedAt: item.completedAt.toISOString(),
      })),
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / result.limit)),
    };
  }

  async create(actor: AuthenticatedUser, dto: CreateReviewDto) {
    this.assertCustomer(actor);
    try {
      const id = await this.repository.transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: dto.orderId },
          select: {
            id: true,
            userId: true,
            branchId: true,
            status: true,
            items: { select: { productId: true } },
          },
        });
        if (!order) {
          throw new NotFoundException({
            code: 'REVIEW_ORDER_NOT_FOUND',
            message: 'Không tìm thấy đơn hàng đã chọn.',
          });
        }
        if (order.userId !== actor.id) {
          throw new ForbiddenException({
            code: 'REVIEW_ORDER_OWNERSHIP_DENIED',
            message: 'Bạn không thể đánh giá sản phẩm từ đơn hàng này.',
          });
        }
        if (order.status !== OrderStatus.COMPLETED) {
          throw new ConflictException({
            code: 'REVIEW_ORDER_NOT_COMPLETED',
            message: 'Bạn chỉ có thể đánh giá đơn hàng đã hoàn thành.',
          });
        }
        if (!order.items.some((item) => item.productId === dto.productId)) {
          throw new ConflictException({
            code: 'REVIEW_PRODUCT_NOT_IN_ORDER',
            message: 'Sản phẩm này không thuộc đơn hàng đã chọn.',
          });
        }
        const product = await tx.product.findUnique({
          where: { id: dto.productId },
          select: { id: true },
        });
        if (!product) {
          throw new ConflictException({
            code: 'REVIEW_NOT_ELIGIBLE',
            message: 'Sản phẩm không còn đủ điều kiện đánh giá.',
          });
        }
        const review = await tx.review.create({
          data: {
            userId: actor.id,
            orderId: order.id,
            productId: dto.productId,
            branchId: order.branchId,
            rating: dto.rating,
            content: dto.content ?? null,
          },
          select: { id: true },
        });
        return review.id;
      });
      const created = await this.repository.findMine(actor.id, id);
      if (!created) this.notFound();
      return this.toCustomer(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'REVIEW_ALREADY_EXISTS',
          message: 'Bạn đã đánh giá sản phẩm này trong đơn hàng này.',
        });
      }
      throw error;
    }
  }

  async update(
    actor: AuthenticatedUser,
    reviewId: string,
    dto: UpdateReviewDto,
  ) {
    this.assertCustomer(actor);
    const updated = await this.repository.transaction(async (tx) => {
      const claimed = await tx.review.updateMany({
        where: { id: reviewId, userId: actor.id },
        data: { rating: dto.rating, content: dto.content ?? null },
      });
      if (claimed.count !== 1) this.notFound();
      return tx.review.findUnique({
        where: { id: reviewId },
        include: {
          order: { select: { orderCode: true } },
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              media: {
                where: { variantId: null, type: 'IMAGE' },
                orderBy: [
                  { isPrimary: 'desc' },
                  { sortOrder: 'asc' },
                  { id: 'asc' },
                ],
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      });
    });
    if (!updated) this.notFound();
    return this.toCustomer(updated);
  }

  async remove(actor: AuthenticatedUser, reviewId: string) {
    this.assertCustomer(actor);
    const removed = await this.repository.transaction((tx) =>
      tx.review.deleteMany({ where: { id: reviewId, userId: actor.id } }),
    );
    if (removed.count !== 1) this.notFound();
    return { id: reviewId };
  }

  async adminList(query: AdminReviewListQueryDto) {
    const result = await this.repository.listAdmin(query);
    return {
      items: result.items.map((item) => this.toAdmin(item)),
      page: result.page,
      limit: result.limit,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / result.limit)),
    };
  }

  async setVisibility(reviewId: string, isVisible: boolean) {
    const current = await this.repository.findAdmin(reviewId);
    if (!current) this.adminNotFound();
    if (current.isVisible === isVisible) return this.toAdmin(current);
    return this.toAdmin(
      await this.repository.updateVisibility(reviewId, isVisible),
    );
  }

  private toCustomer(item: CustomerReviewRecord) {
    return {
      id: item.id,
      orderId: item.orderId,
      orderCode: item.order.orderCode,
      product: {
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        imageUrl: item.product.media[0]?.url ?? null,
      },
      rating: item.rating,
      content: item.content,
      isVisible: item.isVisible,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private toAdmin(item: AdminReviewRecord) {
    return {
      ...this.toCustomer(item),
      customerName: item.user.fullName?.trim() || 'Khách hàng Bookora',
      customerEmail: item.user.email,
      customerAvatarUrl: item.user.avatarUrl,
      branchId: item.branchId ?? '',
      branchName: item.branch?.name ?? 'Chi nhánh đã ngừng hoạt động',
    };
  }

  private assertCustomer(actor: AuthenticatedUser): void {
    if (actor.type !== UserType.CUSTOMER) {
      throw new ForbiddenException({
        code: 'REVIEW_NOT_ELIGIBLE',
        message: 'Chỉ khách hàng được quản lý đánh giá.',
      });
    }
  }

  private async assertOwnedOrderFilter(
    userId: string,
    orderId?: string,
  ): Promise<void> {
    if (!orderId) return;
    if (await this.repository.findOwnedOrder(userId, orderId)) return;
    throw new NotFoundException({
      code: 'REVIEW_ORDER_NOT_FOUND',
      message: 'Không tìm thấy đơn hàng đã chọn.',
    });
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'REVIEW_NOT_FOUND',
      message: 'Không tìm thấy đánh giá.',
    });
  }

  private adminNotFound(): never {
    throw new NotFoundException({
      code: 'ADMIN_REVIEW_NOT_FOUND',
      message: 'Không tìm thấy đánh giá cần quản lý.',
    });
  }
}
