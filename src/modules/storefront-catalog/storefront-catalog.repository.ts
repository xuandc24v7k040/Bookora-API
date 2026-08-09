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

  listRelated(categoryIds: string[], excludeProductId: string) {
    return this.prisma.product.findMany({
      where: {
        ...publicProductVisibilityWhere,
        id: { not: excludeProductId },
        categories: { some: { categoryId: { in: categoryIds } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 12,
      select: publicProductSelect,
    });
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
