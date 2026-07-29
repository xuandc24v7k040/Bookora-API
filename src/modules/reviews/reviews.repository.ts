import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import type {
  AdminReviewListQueryDto,
  CustomerReviewListQueryDto,
  PendingReviewQueryDto,
  PublicReviewQueryDto,
} from './dto';
import { AdminReviewSortBy } from './dto';

const customerReviewInclude = {
  order: { select: { orderCode: true } },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      media: {
        where: { variantId: null, type: 'IMAGE' as const },
        orderBy: [
          { isPrimary: 'desc' as const },
          { sortOrder: 'asc' as const },
          { id: 'asc' as const },
        ],
        take: 1,
        select: { url: true },
      },
    },
  },
} satisfies Prisma.ReviewInclude;

const adminReviewInclude = {
  ...customerReviewInclude,
  user: {
    select: { fullName: true, email: true, avatarUrl: true },
  },
  branch: { select: { name: true } },
} satisfies Prisma.ReviewInclude;

export type CustomerReviewRecord = Prisma.ReviewGetPayload<{
  include: typeof customerReviewInclude;
}>;
export type AdminReviewRecord = Prisma.ReviewGetPayload<{
  include: typeof adminReviewInclude;
}>;

export interface PendingReviewRecord {
  orderId: string;
  orderCode: string;
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  completedAt: Date;
}

function adminReviewOrderBy(
  sortBy: AdminReviewSortBy,
  sortOrder: Prisma.SortOrder,
): Prisma.ReviewOrderByWithRelationInput {
  switch (sortBy) {
    case AdminReviewSortBy.PRODUCT_NAME:
      return { product: { name: sortOrder } };
    case AdminReviewSortBy.ORDER_CODE:
      return { order: { orderCode: sortOrder } };
    case AdminReviewSortBy.CUSTOMER_NAME:
      return { user: { fullName: sortOrder } };
    case AdminReviewSortBy.BRANCH_NAME:
      return { branch: { name: sortOrder } };
    case AdminReviewSortBy.IS_VISIBLE:
      return { isVisible: sortOrder };
    case AdminReviewSortBy.UPDATED_AT:
      return { updatedAt: sortOrder };
    case AdminReviewSortBy.RATING:
      return { rating: sortOrder };
    case AdminReviewSortBy.CREATED_AT:
    default:
      return { createdAt: sortOrder };
  }
}

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublicProduct(productId: string) {
    return this.prisma.product.findFirst({
      where: { id: productId, status: 'ACTIVE' },
      select: { id: true },
    });
  }

  async listPublic(productId: string, query: PublicReviewQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.limit ?? 5;
    const summaryWhere: Prisma.ReviewWhereInput = {
      productId,
      isVisible: true,
    };
    const where: Prisma.ReviewWhereInput = {
      ...summaryWhere,
      rating: query.rating,
      // Review luôn gắn với Order hợp lệ. Giá trị false vì vậy không có kết quả.
      id: query.verifiedPurchase === false ? '' : undefined,
    };
    const [items, totalItems, aggregate, distribution] =
      await this.prisma.$transaction([
        this.prisma.review.findMany({
          where,
          select: {
            id: true,
            rating: true,
            content: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { fullName: true, avatarUrl: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.review.count({ where }),
        this.prisma.review.aggregate({
          where: summaryWhere,
          _count: { _all: true },
          _avg: { rating: true },
        }),
        this.prisma.review.groupBy({
          by: ['rating'],
          where: summaryWhere,
          _count: { _all: true },
          orderBy: { rating: 'desc' },
        }),
      ]);
    return { items, totalItems, aggregate, distribution, pageSize };
  }

  async listMine(userId: string, query: CustomerReviewListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.ReviewWhereInput = {
      userId,
      orderId: query.orderId,
    };
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: customerReviewInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items, totalItems, page, limit };
  }

  findOwnedOrder(userId: string, orderId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    });
  }

  async listPending(userId: string, query: PendingReviewQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filters = Prisma.sql`
      o.user_id = ${userId}
      AND o.status = 'COMPLETED'
      AND oi.product_id IS NOT NULL
      ${query.productId ? Prisma.sql`AND oi.product_id = ${query.productId}` : Prisma.empty}
      ${query.orderId ? Prisma.sql`AND o.id = ${query.orderId}` : Prisma.empty}
      AND NOT EXISTS (
        SELECT 1 FROM reviews r
        WHERE r.user_id = ${userId}
          AND r.order_id = o.id
          AND r.product_id = oi.product_id
      )
    `;
    const [items, countRows] = await Promise.all([
      this.prisma.$queryRaw<PendingReviewRecord[]>(Prisma.sql`
        SELECT opportunities."orderId", opportunities."orderCode",
          opportunities."productId", opportunities."productName",
          opportunities."productSlug", opportunities."imageUrl",
          opportunities."completedAt"
        FROM (
          SELECT DISTINCT ON (o.id, oi.product_id)
            o.id AS "orderId", o.order_code AS "orderCode",
            oi.product_id AS "productId", oi.product_name AS "productName",
            oi.product_slug AS "productSlug", oi.image_url AS "imageUrl",
            COALESCE(completed.created_at, o.updated_at) AS "completedAt",
            o.created_at AS "orderCreatedAt"
          FROM orders o
          JOIN order_items oi ON oi.order_id = o.id
          LEFT JOIN LATERAL (
            SELECT osh.created_at
            FROM order_status_histories osh
            WHERE osh.order_id = o.id AND osh.to_status = 'COMPLETED'
            ORDER BY osh.created_at DESC, osh.id DESC LIMIT 1
          ) completed ON true
          WHERE ${filters}
          ORDER BY o.id, oi.product_id, oi.id
        ) opportunities
        ORDER BY opportunities."completedAt" DESC,
          opportunities."orderCreatedAt" DESC,
          opportunities."orderId" DESC,
          opportunities."productId" DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `),
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count FROM (
          SELECT o.id, oi.product_id
          FROM orders o JOIN order_items oi ON oi.order_id = o.id
          WHERE ${filters}
          GROUP BY o.id, oi.product_id
        ) opportunities
      `),
    ]);
    return {
      items,
      totalItems: countRows[0]?.count ?? 0,
      page,
      limit,
    };
  }

  transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  findMine(userId: string, reviewId: string) {
    return this.prisma.review.findFirst({
      where: { id: reviewId, userId },
      include: customerReviewInclude,
    });
  }

  async listAdmin(query: AdminReviewListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();
    const where: Prisma.ReviewWhereInput = {
      rating: query.rating,
      isVisible: query.isVisible,
      branchId: query.branchId,
      OR: search
        ? [
            { product: { name: { contains: search, mode: 'insensitive' } } },
            { user: { fullName: { contains: search, mode: 'insensitive' } } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
            { order: { orderCode: { contains: search, mode: 'insensitive' } } },
            { content: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const sortBy = query.sortBy ?? AdminReviewSortBy.CREATED_AT;
    const sortOrder = query.sortOrder ?? 'desc';
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: adminReviewInclude,
        orderBy: [adminReviewOrderBy(sortBy, sortOrder), { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items, totalItems, page, limit };
  }

  findAdmin(reviewId: string) {
    return this.prisma.review.findUnique({
      where: { id: reviewId },
      include: adminReviewInclude,
    });
  }

  updateVisibility(reviewId: string, isVisible: boolean) {
    return this.prisma.review.update({
      where: { id: reviewId },
      data: { isVisible },
      include: adminReviewInclude,
    });
  }

  countWritten(userId: string) {
    return this.prisma.review.count({ where: { userId } });
  }

  pendingCount(userId: string) {
    return this.listPending(userId, { page: 1, limit: 1 }).then(
      ({ totalItems }) => totalItems,
    );
  }
}
