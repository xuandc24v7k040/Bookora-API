import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  ProductMediaType,
  ProductStatus,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { StorefrontProductSort, type PublicProductQueryDto } from './dto';
import { STOREFRONT_DEMO_POPULAR_SLUGS } from './storefront-catalog.constants';

const activeCategoryWhere: Prisma.CategoryWhereInput = {
  isActive: true,
  OR: [{ parentId: null }, { parent: { is: { isActive: true } } }],
};

export const publicProductVisibilityWhere: Prisma.ProductWhereInput = {
  status: ProductStatus.ACTIVE,
  categories: { some: { category: activeCategoryWhere } },
  variants: { some: { isActive: true, isDefault: true } },
  media: {
    some: {
      variantId: null,
      type: ProductMediaType.IMAGE,
      isPrimary: true,
    },
  },
};

const publicMediaSelect = {
  id: true,
  url: true,
  altText: true,
  sortOrder: true,
  isPrimary: true,
} satisfies Prisma.ProductMediaSelect;

export const publicProductSelect = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  description: true,
  releaseDate: true,
  createdAt: true,
  publisher: { select: { id: true, name: true, slug: true } },
  authors: {
    orderBy: { author: { name: 'asc' as const } },
    select: { author: { select: { id: true, name: true, slug: true } } },
  },
  categories: {
    where: { category: activeCategoryWhere },
    orderBy: [
      { isPrimary: 'desc' as const },
      { category: { sortOrder: 'asc' as const } },
      { category: { name: 'asc' as const } },
    ],
    select: {
      isPrimary: true,
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
          sortOrder: true,
          parentId: true,
          parent: {
            select: {
              id: true,
              name: true,
              slug: true,
              imageUrl: true,
              sortOrder: true,
              isActive: true,
            },
          },
        },
      },
    },
  },
  media: {
    where: { variantId: null, type: ProductMediaType.IMAGE },
    orderBy: [
      { isPrimary: 'desc' as const },
      { sortOrder: 'asc' as const },
      { id: 'asc' as const },
    ],
    select: publicMediaSelect,
  },
  options: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      name: true,
      code: true,
      presentationType: true,
      sortOrder: true,
      values: {
        orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
        select: {
          id: true,
          label: true,
          value: true,
          colorCode: true,
          imageUrl: true,
          sortOrder: true,
        },
      },
    },
  },
  variants: {
    where: { isActive: true },
    orderBy: [
      { isDefault: 'desc' as const },
      { name: 'asc' as const },
      { id: 'asc' as const },
    ],
    select: {
      id: true,
      name: true,
      originalPrice: true,
      salePrice: true,
      saleStartAt: true,
      saleEndAt: true,
      isDefault: true,
      isbn: true,
      barcode: true,
      publicationYear: true,
      pageCount: true,
      weightGram: true,
      packageSize: true,
      optionValues: {
        orderBy: { option: { sortOrder: 'asc' as const } },
        select: { optionId: true, optionValueId: true },
      },
      media: {
        where: { type: ProductMediaType.IMAGE },
        orderBy: [
          { isPrimary: 'desc' as const },
          { sortOrder: 'asc' as const },
          { id: 'asc' as const },
        ],
        select: publicMediaSelect,
      },
    },
  },
  attributeValues: {
    orderBy: { attribute: { name: 'asc' as const } },
    select: {
      textValue: true,
      numberValue: true,
      booleanValue: true,
      dateValue: true,
      jsonValue: true,
      attribute: { select: { code: true, name: true } },
    },
  },
} satisfies Prisma.ProductSelect;

export type PublicProductRecord = Prisma.ProductGetPayload<{
  select: typeof publicProductSelect;
}>;

export interface PublicProductFacetItem {
  value: string;
  label: string;
  count: number;
}

export interface PublicSearchMatch {
  id: string;
  isBestMatch: boolean;
  isBestSeller: boolean;
}

export interface PublicSearchSuggestionRecord {
  product: PublicProductRecord;
  isBestMatch: boolean;
  isBestSeller: boolean;
}

export interface PublicProductFacets {
  authors: PublicProductFacetItem[];
  publishers: PublicProductFacetItem[];
  categories: PublicProductFacetItem[];
  attributes: PublicProductFacetItem[];
}

export interface PublicProductRatingAggregate {
  averageRating: number | null;
  reviewCount: number;
}

@Injectable()
export class StorefrontCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        imageUrl: true,
        sortOrder: true,
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            sortOrder: true,
          },
        },
      },
    });
  }

  listProducts(query: PublicProductQueryDto, now: Date) {
    return this.prisma.product.findMany({
      where: this.listWhere(query, now),
      select: publicProductSelect,
    });
  }

  async listProductPage(query: PublicProductQueryDto, now: Date) {
    const searchMatches = query.q
      ? await this.searchProductMatches(query.q)
      : null;
    const rankedSearchIds = searchMatches?.map((match) => match.id) ?? null;
    if (rankedSearchIds && !rankedSearchIds.length) {
      return {
        records: [] as PublicProductRecord[],
        totalItems: 0,
        facets: this.emptyFacets(),
      };
    }
    const where: Prisma.ProductWhereInput = {
      ...this.listWhere(query, now),
      ...(rankedSearchIds ? { id: { in: rankedSearchIds } } : {}),
    };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const offset = (page - 1) * pageSize;
    const [matchingProducts, totalItems] = await Promise.all([
      this.prisma.product.findMany({ where, select: { id: true } }),
      this.prisma.product.count({ where }),
    ]);
    const matchingIds = matchingProducts.map(({ id }) => id);
    if (!matchingIds.length) {
      return {
        records: [] as PublicProductRecord[],
        totalItems,
        facets: this.emptyFacets(),
      };
    }

    const sort =
      query.sort ??
      (query.q
        ? StorefrontProductSort.RELEVANCE
        : StorefrontProductSort.POPULAR);
    const orderedIds =
      sort === StorefrontProductSort.RELEVANCE && rankedSearchIds
        ? rankedSearchIds
            .filter((id) => matchingIds.includes(id))
            .slice(offset, offset + pageSize)
        : await this.listOrderedProductIds(
            matchingIds,
            sort,
            now,
            pageSize,
            offset,
          );
    const [records, facets] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: orderedIds } },
        select: publicProductSelect,
      }),
      this.listFacets(matchingIds),
    ]);
    const position = new Map(orderedIds.map((id, index) => [id, index]));
    records.sort(
      (left, right) =>
        (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
    return { records, totalItems, facets };
  }

  async listSearchSuggestions(q: string, limit: number) {
    const matches = await this.searchProductMatches(q);
    const rankedIds = matches.map((match) => match.id);
    if (!rankedIds.length) {
      return { records: [] as PublicSearchSuggestionRecord[], totalItems: 0 };
    }
    const records = await this.prisma.product.findMany({
      where: {
        ...publicProductVisibilityWhere,
        id: { in: rankedIds },
      },
      select: publicProductSelect,
    });
    const position = new Map(rankedIds.map((id, index) => [id, index]));
    records.sort(
      (left, right) =>
        (position.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (position.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
    const matchesById = new Map(matches.map((match) => [match.id, match]));
    return {
      records: records.slice(0, limit).map((product) => ({
        product,
        isBestMatch: matchesById.get(product.id)?.isBestMatch ?? false,
        isBestSeller: matchesById.get(product.id)?.isBestSeller ?? false,
      })),
      totalItems: records.length,
    };
  }

  listProductsByIds(ids: string[]) {
    return this.prisma.product.findMany({
      where: { ...publicProductVisibilityWhere, id: { in: ids } },
      select: publicProductSelect,
    });
  }

  findProductBySlug(slug: string) {
    return this.prisma.product.findFirst({
      where: { ...publicProductVisibilityWhere, slug },
      select: publicProductSelect,
    });
  }

  findPublicProductId(productId: string) {
    return this.prisma.product.findFirst({
      where: { ...publicProductVisibilityWhere, id: productId },
      select: { id: true },
    });
  }

  async listRelatedProductIds(
    productId: string,
    limit: number,
    now: Date,
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ candidateId: string }>>(
      Prisma.sql`
        WITH current_product AS (
          SELECT
            p.id,
            p.publisher_id,
            CASE
              WHEN default_variant.sale_price IS NOT NULL
                AND (default_variant.sale_start_at IS NULL OR default_variant.sale_start_at <= ${now})
                AND (default_variant.sale_end_at IS NULL OR default_variant.sale_end_at >= ${now})
              THEN default_variant.sale_price
              ELSE default_variant.original_price
            END AS effective_price
          FROM products p
          JOIN product_variants default_variant
            ON default_variant.product_id = p.id
            AND default_variant.is_active = true
            AND default_variant.is_default = true
          WHERE p.id = ${productId}
        ),
        current_categories AS (
          SELECT DISTINCT category.id, category.parent_id
          FROM product_categories product_category
          JOIN categories category
            ON category.id = product_category.category_id
            AND category.is_active = true
          WHERE product_category.product_id = ${productId}
            AND (
              category.parent_id IS NULL
              OR EXISTS (
                SELECT 1
                FROM categories parent_category
                WHERE parent_category.id = category.parent_id
                  AND parent_category.is_active = true
              )
            )
        ),
        current_authors AS (
          SELECT author_id
          FROM product_authors
          WHERE product_id = ${productId}
        ),
        completed_sales AS (
          SELECT sold_variant.product_id, SUM(order_item.quantity)::bigint AS sold_quantity
          FROM order_items order_item
          JOIN orders completed_order ON completed_order.id = order_item.order_id
          JOIN product_variants sold_variant ON sold_variant.id = order_item.variant_id
          WHERE completed_order.status = 'COMPLETED'
          GROUP BY sold_variant.product_id
        ),
        visible_ratings AS (
          SELECT review.product_id, AVG(review.rating)::numeric AS average_rating
          FROM reviews review
          WHERE review.is_visible = true
          GROUP BY review.product_id
        ),
        candidate_pool AS (
          SELECT
            candidate.id AS candidate_id,
            candidate.publisher_id,
            candidate.created_at,
            CASE
              WHEN default_variant.sale_price IS NOT NULL
                AND (default_variant.sale_start_at IS NULL OR default_variant.sale_start_at <= ${now})
                AND (default_variant.sale_end_at IS NULL OR default_variant.sale_end_at >= ${now})
              THEN default_variant.sale_price
              ELSE default_variant.original_price
            END AS effective_price,
            COALESCE(completed_sales.sold_quantity, 0) AS sold_quantity,
            COALESCE(visible_ratings.average_rating, 0) AS average_rating
          FROM products candidate
          JOIN current_product ON true
          JOIN product_variants default_variant
            ON default_variant.product_id = candidate.id
            AND default_variant.is_active = true
            AND default_variant.is_default = true
          LEFT JOIN completed_sales ON completed_sales.product_id = candidate.id
          LEFT JOIN visible_ratings ON visible_ratings.product_id = candidate.id
          WHERE candidate.id <> current_product.id
            AND candidate.status = 'ACTIVE'
            AND EXISTS (
              SELECT 1
              FROM product_categories visible_product_category
              JOIN categories visible_category
                ON visible_category.id = visible_product_category.category_id
                AND visible_category.is_active = true
              WHERE visible_product_category.product_id = candidate.id
                AND (
                  visible_category.parent_id IS NULL
                  OR EXISTS (
                    SELECT 1
                    FROM categories visible_parent
                    WHERE visible_parent.id = visible_category.parent_id
                      AND visible_parent.is_active = true
                  )
                )
            )
            AND EXISTS (
              SELECT 1
              FROM product_media primary_media
              WHERE primary_media.product_id = candidate.id
                AND primary_media.variant_id IS NULL
                AND primary_media.type = 'IMAGE'
                AND primary_media.is_primary = true
            )
        ),
        candidate_scores AS (
          SELECT DISTINCT candidate_pool.candidate_id, 5 AS score
          FROM candidate_pool
          JOIN product_categories candidate_product_category
            ON candidate_product_category.product_id = candidate_pool.candidate_id
          JOIN categories candidate_category
            ON candidate_category.id = candidate_product_category.category_id
            AND candidate_category.is_active = true
          JOIN current_categories ON current_categories.id = candidate_category.id
          WHERE candidate_category.parent_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM categories active_parent
              WHERE active_parent.id = candidate_category.parent_id
                AND active_parent.is_active = true
            )

          UNION ALL

          SELECT DISTINCT candidate_pool.candidate_id, 4 AS score
          FROM candidate_pool
          JOIN product_authors candidate_author
            ON candidate_author.product_id = candidate_pool.candidate_id
          JOIN current_authors ON current_authors.author_id = candidate_author.author_id

          UNION ALL

          SELECT DISTINCT candidate_pool.candidate_id, 3 AS score
          FROM candidate_pool
          JOIN product_categories candidate_product_category
            ON candidate_product_category.product_id = candidate_pool.candidate_id
          JOIN categories candidate_category
            ON candidate_category.id = candidate_product_category.category_id
            AND candidate_category.is_active = true
          JOIN current_categories
            ON current_categories.parent_id IS NOT NULL
            AND current_categories.parent_id = candidate_category.parent_id

          UNION ALL

          SELECT candidate_pool.candidate_id, 2 AS score
          FROM candidate_pool
          JOIN current_product ON true
          WHERE current_product.publisher_id IS NOT NULL
            AND candidate_pool.publisher_id = current_product.publisher_id

          UNION ALL

          SELECT candidate_pool.candidate_id, 1 AS score
          FROM candidate_pool
          JOIN current_product ON true
          WHERE current_product.effective_price > 0
            AND candidate_pool.effective_price BETWEEN
              current_product.effective_price * 0.75
              AND current_product.effective_price * 1.25
        ),
        scored AS (
          SELECT candidate_id, SUM(score)::int AS relevance_score
          FROM candidate_scores
          GROUP BY candidate_id
        ),
        similarity_ranked AS (
          SELECT
            candidate_pool.candidate_id,
            ROW_NUMBER() OVER (
              ORDER BY
                scored.relevance_score DESC,
                candidate_pool.sold_quantity DESC,
                candidate_pool.average_rating DESC,
                candidate_pool.created_at DESC,
                candidate_pool.candidate_id ASC
            ) AS position
          FROM scored
          JOIN candidate_pool ON candidate_pool.candidate_id = scored.candidate_id
        ),
        similarity_selected AS (
          SELECT candidate_id, position
          FROM similarity_ranked
          WHERE position <= ${limit}
        ),
        bestseller_ranked AS (
          SELECT
            candidate_pool.candidate_id,
            ROW_NUMBER() OVER (
              ORDER BY
                candidate_pool.sold_quantity DESC,
                candidate_pool.average_rating DESC,
                candidate_pool.created_at DESC,
                candidate_pool.candidate_id ASC
            ) AS position
          FROM candidate_pool
          WHERE candidate_pool.sold_quantity > 0
            AND NOT EXISTS (
              SELECT 1
              FROM similarity_selected
              WHERE similarity_selected.candidate_id = candidate_pool.candidate_id
            )
        ),
        bestseller_selected AS (
          SELECT candidate_id, position
          FROM bestseller_ranked
          WHERE position <= GREATEST(
            0,
            ${limit} - (SELECT COUNT(*)::int FROM similarity_selected)
          )
        ),
        newest_ranked AS (
          SELECT
            candidate_pool.candidate_id,
            ROW_NUMBER() OVER (
              ORDER BY
                candidate_pool.created_at DESC,
                candidate_pool.sold_quantity DESC,
                candidate_pool.average_rating DESC,
                candidate_pool.candidate_id ASC
            ) AS position
          FROM candidate_pool
          WHERE NOT EXISTS (
              SELECT 1
              FROM similarity_selected
              WHERE similarity_selected.candidate_id = candidate_pool.candidate_id
            )
            AND NOT EXISTS (
              SELECT 1
              FROM bestseller_selected
              WHERE bestseller_selected.candidate_id = candidate_pool.candidate_id
            )
        ),
        newest_selected AS (
          SELECT candidate_id, position
          FROM newest_ranked
          WHERE position <= GREATEST(
            0,
            ${limit}
              - (SELECT COUNT(*)::int FROM similarity_selected)
              - (SELECT COUNT(*)::int FROM bestseller_selected)
          )
        ),
        final_selection AS (
          SELECT candidate_id, 1 AS tier, position FROM similarity_selected
          UNION ALL
          SELECT candidate_id, 2 AS tier, position FROM bestseller_selected
          UNION ALL
          SELECT candidate_id, 3 AS tier, position FROM newest_selected
        )
        SELECT candidate_id AS "candidateId"
        FROM final_selection
        ORDER BY tier ASC, position ASC, candidate_id ASC
        LIMIT ${limit}
      `,
    );
    return rows.map(({ candidateId }) => candidateId);
  }

  findAvailability(branchId: string, productId: string) {
    return this.prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        stocks: {
          where: {
            variant: {
              productId,
              isActive: true,
              product: publicProductVisibilityWhere,
            },
          },
          select: {
            variantId: true,
            quantity: true,
            lowStockThreshold: true,
          },
        },
      },
    });
  }

  findPublicVariants(productId: string) {
    return this.prisma.productVariant.findMany({
      where: {
        productId,
        isActive: true,
        product: publicProductVisibilityWhere,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true, isDefault: true },
    });
  }

  async completedSalesByProduct(): Promise<Map<string, number>> {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { status: OrderStatus.COMPLETED } },
      select: { quantity: true, variant: { select: { productId: true } } },
    });
    const sales = new Map<string, number>();
    for (const item of items) {
      if (!item.variant) continue;
      sales.set(
        item.variant.productId,
        (sales.get(item.variant.productId) ?? 0) + item.quantity,
      );
    }
    return sales;
  }

  async ratingAggregates(
    productIds: string[],
  ): Promise<Map<string, PublicProductRatingAggregate>> {
    if (!productIds.length) return new Map();
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

  private async searchProductMatches(
    search: string,
  ): Promise<PublicSearchMatch[]> {
    const normalized = search.trim().replace(/\s+/gu, ' ');
    if (!normalized) return [];

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        matchRank: number;
        isBestSeller: boolean;
      }>
    >(Prisma.sql`
      WITH bestseller_products AS (
        SELECT sold_variant.product_id
        FROM order_items oi
        JOIN orders completed_order ON completed_order.id = oi.order_id
        JOIN product_variants sold_variant ON sold_variant.id = oi.variant_id
        WHERE completed_order.status = 'COMPLETED'
        GROUP BY sold_variant.product_id
        ORDER BY SUM(oi.quantity) DESC, sold_variant.product_id ASC
        LIMIT 5
      )
      SELECT
        p.id,
        bp.product_id IS NOT NULL AS "isBestSeller",
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM product_variants exact_variant
            WHERE exact_variant.product_id = p.id
              AND exact_variant.is_active = true
              AND (
                public.bookora_normalize_search(COALESCE(exact_variant.isbn, '')) = query.value
                OR public.bookora_normalize_search(COALESCE(exact_variant.barcode, '')) = query.value
                OR public.bookora_normalize_search(exact_variant.sku) = query.value
              )
          ) THEN 0
          WHEN public.bookora_normalize_search(p.name) = query.value THEN 1
          WHEN left(public.bookora_normalize_search(p.name), length(query.value)) = query.value THEN 2
          WHEN strpos(public.bookora_normalize_search(p.name), query.value) > 0 THEN 3
          WHEN EXISTS (
            SELECT 1
            FROM product_authors ranked_pa
            JOIN authors ranked_author ON ranked_author.id = ranked_pa.author_id
            WHERE ranked_pa.product_id = p.id
              AND strpos(public.bookora_normalize_search(ranked_author.name), query.value) > 0
          ) THEN 4
          WHEN pub.id IS NOT NULL
            AND strpos(public.bookora_normalize_search(pub.name), query.value) > 0 THEN 5
          ELSE 6
        END AS "matchRank"
      FROM products p
      LEFT JOIN publishers pub ON pub.id = p.publisher_id
      LEFT JOIN bestseller_products bp ON bp.product_id = p.id
      CROSS JOIN (
        SELECT public.bookora_normalize_search(${normalized}) AS value
      ) query
      WHERE
        strpos(public.bookora_normalize_search(p.name), query.value) > 0
        OR (
          length(query.value) >= 4 AND (
            similarity(public.bookora_normalize_search(p.name), query.value) >= 0.24
            OR word_similarity(query.value, public.bookora_normalize_search(p.name)) >= 0.65
          )
        )
        OR (
          pub.id IS NOT NULL AND (
            strpos(public.bookora_normalize_search(pub.name), query.value) > 0
            OR (
              length(query.value) >= 4 AND (
                similarity(public.bookora_normalize_search(pub.name), query.value) >= 0.28
                OR word_similarity(query.value, public.bookora_normalize_search(pub.name)) >= 0.6
              )
            )
          )
        )
        OR EXISTS (
          SELECT 1
          FROM product_authors pa
          JOIN authors a ON a.id = pa.author_id
          WHERE pa.product_id = p.id AND (
            strpos(public.bookora_normalize_search(a.name), query.value) > 0
            OR (
              length(query.value) >= 4 AND (
                similarity(public.bookora_normalize_search(a.name), query.value) >= 0.28
                OR word_similarity(query.value, public.bookora_normalize_search(a.name)) >= 0.6
              )
            )
          )
        )
        OR EXISTS (
          SELECT 1
          FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active = true AND (
            public.bookora_normalize_search(COALESCE(pv.isbn, '')) = query.value
            OR public.bookora_normalize_search(COALESCE(pv.barcode, '')) = query.value
            OR public.bookora_normalize_search(pv.sku) = query.value
          )
        )
      ORDER BY
        "matchRank" ASC,
        GREATEST(
          similarity(public.bookora_normalize_search(p.name), query.value),
          similarity(public.bookora_normalize_search(COALESCE(pub.name, '')), query.value),
          word_similarity(query.value, public.bookora_normalize_search(p.name)),
          word_similarity(
            query.value,
            public.bookora_normalize_search(COALESCE(pub.name, ''))
          )
        ) DESC,
        p.name ASC,
        p.id ASC
    `);
    return rows.map((row) => ({
      id: row.id,
      isBestMatch: row.matchRank <= 2,
      isBestSeller: row.isBestSeller,
    }));
  }

  private listWhere(
    query: PublicProductQueryDto,
    now: Date,
  ): Prisma.ProductWhereInput {
    const activeSaleVariant: Prisma.ProductVariantWhereInput = {
      isActive: true,
      isDefault: true,
      salePrice: { not: null },
      AND: [
        { OR: [{ saleStartAt: null }, { saleStartAt: { lte: now } }] },
        { OR: [{ saleEndAt: null }, { saleEndAt: { gt: now } }] },
      ],
    };
    const attributes = (query.attribute ?? []).map((filter) => {
      const separator = filter.indexOf(':');
      const code = filter.slice(0, separator);
      const value = filter.slice(separator + 1);
      return {
        attribute: { code },
        OR: [
          { textValue: { equals: value, mode: 'insensitive' as const } },
          { jsonValue: { array_contains: value } },
        ],
      } satisfies Prisma.ProductAttributeValueWhereInput;
    });

    return {
      ...publicProductVisibilityWhere,
      ...(query.categorySlug
        ? {
            categories: {
              some: {
                category: {
                  isActive: true,
                  OR: [
                    { slug: query.categorySlug },
                    {
                      parent: {
                        is: { slug: query.categorySlug, isActive: true },
                      },
                    },
                  ],
                },
              },
            },
          }
        : {}),
      ...(query.author?.length
        ? { authors: { some: { author: { slug: { in: query.author } } } } }
        : {}),
      ...(query.publisher?.length
        ? { publisher: { is: { slug: { in: query.publisher } } } }
        : {}),
      AND: [
        ...attributes.map((item) => ({ attributeValues: { some: item } })),
        ...(query.onSale ? [{ variants: { some: activeSaleVariant } }] : []),
        ...(query.priceMin !== undefined || query.priceMax !== undefined
          ? [this.priceWhere(query, now)]
          : []),
      ],
      ...(query.upcoming ? { releaseDate: { gt: now } } : {}),
    };
  }

  private priceWhere(
    query: PublicProductQueryDto,
    now: Date,
  ): Prisma.ProductWhereInput {
    if (query.priceMin === undefined && query.priceMax === undefined) return {};
    const price = {
      ...(query.priceMin !== undefined ? { gte: query.priceMin } : {}),
      ...(query.priceMax !== undefined ? { lte: query.priceMax } : {}),
    };
    const activeSchedule: Prisma.ProductVariantWhereInput[] = [
      { OR: [{ saleStartAt: null }, { saleStartAt: { lte: now } }] },
      { OR: [{ saleEndAt: null }, { saleEndAt: { gt: now } }] },
    ];
    return {
      variants: {
        some: {
          isActive: true,
          isDefault: true,
          OR: [
            { salePrice: { not: null, ...price }, AND: activeSchedule },
            {
              originalPrice: price,
              OR: [
                { salePrice: null },
                { saleStartAt: { gt: now } },
                { saleEndAt: { lte: now } },
              ],
            },
          ],
        },
      },
    };
  }

  private async listOrderedProductIds(
    matchingIds: string[],
    sort: StorefrontProductSort,
    now: Date,
    take: number,
    skip: number,
  ): Promise<string[]> {
    const effectivePrice = Prisma.sql`CASE
      WHEN dv.sale_price IS NOT NULL
        AND (dv.sale_start_at IS NULL OR dv.sale_start_at <= ${now})
        AND (dv.sale_end_at IS NULL OR dv.sale_end_at > ${now})
      THEN dv.sale_price ELSE dv.original_price END`;
    const demoRank = Prisma.join(
      STOREFRONT_DEMO_POPULAR_SLUGS.map(
        (slug, index) => Prisma.sql`WHEN p.slug = ${slug} THEN ${index}`,
      ),
      ' ',
    );
    const orderBy =
      sort === StorefrontProductSort.NEWEST
        ? Prisma.sql`p.created_at DESC, p.id DESC`
        : sort === StorefrontProductSort.PRICE_ASC
          ? Prisma.sql`${effectivePrice} ASC, p.id ASC`
          : sort === StorefrontProductSort.PRICE_DESC
            ? Prisma.sql`${effectivePrice} DESC, p.id ASC`
            : sort === StorefrontProductSort.RELEASE_ASC
              ? Prisma.sql`p.release_date ASC NULLS LAST, p.id ASC`
              : sort === StorefrontProductSort.NAME_ASC
                ? Prisma.sql`p.name ASC, p.id ASC`
                : Prisma.sql`COALESCE(sales.quantity, 0) DESC,
                    CASE ${demoRank} ELSE 2147483647 END ASC,
                    p.name ASC, p.id ASC`;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id
      FROM products p
      JOIN product_variants dv
        ON dv.product_id = p.id AND dv.is_active = true AND dv.is_default = true
      LEFT JOIN (
        SELECT sold_variant.product_id, SUM(oi.quantity)::int AS quantity
        FROM order_items oi
        JOIN product_variants sold_variant ON sold_variant.id = oi.variant_id
        JOIN orders completed_order ON completed_order.id = oi.order_id
        WHERE completed_order.status = 'COMPLETED'
        GROUP BY sold_variant.product_id
      ) sales ON sales.product_id = p.id
      WHERE p.id IN (${Prisma.join(matchingIds)})
      ORDER BY ${orderBy}
      LIMIT ${take} OFFSET ${skip}
    `);
    return rows.map(({ id }) => id);
  }

  private async listFacets(productIds: string[]): Promise<PublicProductFacets> {
    const [authors, publishers, categories, attributes] = await Promise.all([
      this.prisma.$queryRaw<PublicProductFacetItem[]>(Prisma.sql`
        SELECT a.slug AS value, a.name AS label, COUNT(DISTINCT pa.product_id)::int AS count
        FROM product_authors pa JOIN authors a ON a.id = pa.author_id
        WHERE pa.product_id IN (${Prisma.join(productIds)})
        GROUP BY a.id, a.slug, a.name ORDER BY count DESC, a.name ASC
      `),
      this.prisma.$queryRaw<PublicProductFacetItem[]>(Prisma.sql`
        SELECT pub.slug AS value, pub.name AS label, COUNT(DISTINCT p.id)::int AS count
        FROM products p JOIN publishers pub ON pub.id = p.publisher_id
        WHERE p.id IN (${Prisma.join(productIds)})
        GROUP BY pub.id, pub.slug, pub.name ORDER BY count DESC, pub.name ASC
      `),
      this.prisma.$queryRaw<PublicProductFacetItem[]>(Prisma.sql`
        SELECT c.slug AS value, c.name AS label, COUNT(DISTINCT pc.product_id)::int AS count
        FROM product_categories pc JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id IN (${Prisma.join(productIds)})
        GROUP BY c.id, c.slug, c.name ORDER BY count DESC, c.name ASC
      `),
      this.prisma.$queryRaw<PublicProductFacetItem[]>(Prisma.sql`
        SELECT CONCAT(pa.code, ':', values.value) AS value,
          CONCAT(pa.name, ': ', values.value) AS label,
          COUNT(DISTINCT pav.product_id)::int AS count
        FROM product_attribute_values pav
        JOIN product_attributes pa ON pa.id = pav.attribute_id
        CROSS JOIN LATERAL (SELECT COALESCE(
          pav.text_value,
          pav.number_value::text,
          CASE WHEN pav.boolean_value IS NULL THEN NULL WHEN pav.boolean_value THEN 'Có' ELSE 'Không' END,
          TO_CHAR(pav.date_value, 'YYYY-MM-DD'),
          pav.json_value::text
        ) AS value) values
        WHERE pav.product_id IN (${Prisma.join(productIds)}) AND values.value IS NOT NULL
        GROUP BY pa.code, pa.name, values.value ORDER BY count DESC, label ASC
      `),
    ]);
    return { authors, publishers, categories, attributes };
  }

  private emptyFacets(): PublicProductFacets {
    return { authors: [], publishers: [], categories: [], attributes: [] };
  }
}
