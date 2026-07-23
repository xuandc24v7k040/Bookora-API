import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isValid as isValidUlid } from 'ulid';
import {
  PublicProductQueryDto,
  StorefrontAvailabilityStatus,
  StorefrontProductSort,
} from './dto';
import {
  STOREFRONT_DEMO_POPULAR_SLUGS,
  STOREFRONT_RELATED_LIMIT,
} from './storefront-catalog.constants';
import {
  StorefrontCatalogRepository,
  type PublicProductRecord,
} from './storefront-catalog.repository';
import { StorefrontPriceService } from './storefront-price.service';

export interface ListItem {
  id: string;
  name: string;
  slug: string;
  authors: Array<{ id: string; name: string; slug: string }>;
  publisher: { id: string; name: string; slug: string } | null;
  primaryImage: {
    id: string;
    url: string;
    altText: string | null;
    sortOrder: number;
    isPrimary: boolean;
  };
  price: {
    current: number;
    original: number;
    onSale: boolean;
    discountPercent: number;
  };
  releaseDate: string | null;
  rank: number | null;
}

@Injectable()
export class StorefrontCatalogService {
  constructor(
    private readonly repository: StorefrontCatalogRepository,
    private readonly prices: StorefrontPriceService,
  ) {}

  categories() {
    return this.repository.listCategories();
  }

  async home() {
    const now = new Date();
    const [records, completedSales] = await Promise.all([
      this.repository.listProducts({}, now),
      this.repository.completedSalesByProduct(),
    ]);
    const items = records.map((record) => this.toListItem(record, now));
    const popular = this.sortPopular(items, completedSales);

    return {
      bestSellers: popular.slice(0, 5).map((item, index) => ({
        ...item,
        rank: index + 1,
      })),
      newest: [...items]
        .sort((a, b) => {
          const left =
            records.find((record) => record.id === a.id)?.createdAt.getTime() ??
            0;
          const right =
            records.find((record) => record.id === b.id)?.createdAt.getTime() ??
            0;
          return right - left || b.id.localeCompare(a.id);
        })
        .slice(0, 5),
      upcoming: [...items]
        .filter(
          (item) =>
            item.releaseDate &&
            new Date(item.releaseDate).getTime() > now.getTime(),
        )
        .sort(
          (a, b) =>
            new Date(a.releaseDate ?? 0).getTime() -
              new Date(b.releaseDate ?? 0).getTime() ||
            a.id.localeCompare(b.id),
        )
        .slice(0, 3),
    };
  }

  async list(query: PublicProductQueryDto) {
    if (
      query.priceMin !== undefined &&
      query.priceMax !== undefined &&
      query.priceMin > query.priceMax
    ) {
      throw new BadRequestException({
        code: 'PUBLIC_PRODUCT_PRICE_RANGE_INVALID',
        message: 'Khoảng giá không hợp lệ.',
      });
    }

    const now = new Date();
    const result = await this.repository.listProductPage(query, now);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const totalItems = result.totalItems;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const items = result.records.map((record) => this.toListItem(record, now));

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages,
      sort: query.sort ?? StorefrontProductSort.POPULAR,
      facets: result.facets,
    };
  }

  async detail(slug: string) {
    const record = await this.repository.findProductBySlug(slug);
    if (!record) {
      throw new NotFoundException({
        code: 'PUBLIC_PRODUCT_NOT_FOUND',
        message: 'Không tìm thấy sản phẩm hoặc sản phẩm đã ngừng kinh doanh.',
      });
    }

    const categoryIds = record.categories.map(({ category }) => category.id);
    const related = await this.repository.listRelated(categoryIds, record.id);
    const primaryCategory = record.categories[0]?.category;
    const relatedSorted = related.sort((left, right) => {
      const leftExact = primaryCategory
        ? left.categories.some(
            ({ category }) => category.id === primaryCategory.id,
          )
        : false;
      const rightExact = primaryCategory
        ? right.categories.some(
            ({ category }) => category.id === primaryCategory.id,
          )
        : false;
      return (
        Number(rightExact) - Number(leftExact) ||
        right.createdAt.getTime() - left.createdAt.getTime()
      );
    });
    const now = new Date();
    const categories = this.detailCategories(record);

    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      shortDescription: record.shortDescription,
      description: record.description,
      releaseDate: record.releaseDate?.toISOString() ?? null,
      categories,
      authors: record.authors.map(({ author }) => author),
      publisher: record.publisher,
      generalMedia: record.media,
      options: record.options,
      variants: record.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        isDefault: variant.isDefault,
        price: this.prices.resolve(variant, now),
        isbn: variant.isbn,
        publicationYear: variant.publicationYear,
        pageCount: variant.pageCount,
        weightGram: variant.weightGram,
        packageSize: variant.packageSize,
        optionValues: variant.optionValues,
        media: variant.media,
      })),
      attributes: record.attributeValues.map((attribute) => ({
        code: attribute.attribute.code,
        name: attribute.attribute.name,
        value: this.attributeValue(attribute),
      })),
      relatedProducts: relatedSorted
        .slice(0, STOREFRONT_RELATED_LIMIT)
        .map((item) => this.toListItem(item, now)),
      seo: {
        title: `${record.name} | Bookora`,
        description:
          record.shortDescription?.trim() ||
          `Khám phá ${record.name} tại Bookora.`,
        canonicalPath: `/books/${record.slug}`,
        imageUrl: record.media[0]?.url ?? null,
      },
    };
  }

  async availability(
    branchId: string | undefined,
    productId: string,
    variantId?: string,
  ) {
    if (!branchId || !isValidUlid(branchId)) {
      throw new BadRequestException({
        code: 'STOREFRONT_BRANCH_NOT_FOUND',
        message: 'Vui lòng chọn một chi nhánh hợp lệ.',
      });
    }
    const publicVariant = await this.repository.findPublicVariant(
      productId,
      variantId,
    );
    if (!publicVariant) {
      throw new NotFoundException({
        code: variantId
          ? 'PUBLIC_PRODUCT_VARIANT_NOT_FOUND'
          : 'PUBLIC_PRODUCT_NOT_FOUND',
        message: variantId
          ? 'Phiên bản đã chọn hiện không còn khả dụng.'
          : 'Không tìm thấy sản phẩm hoặc sản phẩm đã ngừng kinh doanh.',
      });
    }
    const branch = await this.repository.findAvailability(
      branchId,
      productId,
      publicVariant.id,
    );
    if (!branch) {
      throw new NotFoundException({
        code: 'STOREFRONT_BRANCH_NOT_FOUND',
        message: 'Không tìm thấy chi nhánh.',
      });
    }
    if (!branch.isActive) {
      throw new ConflictException({
        code: 'STOREFRONT_BRANCH_INACTIVE',
        message: 'Chi nhánh không còn hoạt động. Vui lòng chọn chi nhánh khác.',
      });
    }
    const stock = branch.stocks[0];
    const quantity = stock?.quantity ?? 0;
    const status =
      quantity <= 0
        ? StorefrontAvailabilityStatus.OUT_OF_STOCK
        : stock && quantity <= stock.lowStockThreshold
          ? StorefrontAvailabilityStatus.LOW_STOCK
          : StorefrontAvailabilityStatus.IN_STOCK;

    return {
      branch: { id: branch.id, code: branch.code, name: branch.name },
      productId,
      variantId: publicVariant.id,
      availableQuantity: quantity,
      status,
    };
  }

  private toListItem(record: PublicProductRecord, now: Date): ListItem {
    const defaultVariant =
      record.variants.find((variant) => variant.isDefault) ??
      record.variants[0];
    const primaryImage =
      record.media.find((media) => media.isPrimary) ?? record.media[0];
    if (!defaultVariant || !primaryImage) {
      throw new Error('Public product invariant was not satisfied.');
    }
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      authors: record.authors.map(({ author }) => author),
      publisher: record.publisher,
      primaryImage,
      price: this.prices.resolve(defaultVariant, now),
      releaseDate: record.releaseDate?.toISOString() ?? null,
      rank: null,
    };
  }

  private sortPopular(
    items: ListItem[],
    sales: Map<string, number>,
  ): ListItem[] {
    const demoRank = new Map<string, number>(
      STOREFRONT_DEMO_POPULAR_SLUGS.map((slug, index) => [slug, index]),
    );
    const hasSales = [...sales.values()].some((quantity) => quantity > 0);
    return [...items].sort((left, right) => {
      if (hasSales) {
        const quantityDifference =
          (sales.get(right.id) ?? 0) - (sales.get(left.id) ?? 0);
        if (quantityDifference !== 0) return quantityDifference;
      }
      const leftRank = demoRank.get(left.slug) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = demoRank.get(right.slug) ?? Number.MAX_SAFE_INTEGER;
      return (
        leftRank - rightRank ||
        left.name.localeCompare(right.name, 'vi') ||
        left.id.localeCompare(right.id)
      );
    });
  }

  private attributeValue(
    attribute: PublicProductRecord['attributeValues'][number],
  ): string {
    if (attribute.textValue !== null) return attribute.textValue;
    if (attribute.numberValue !== null) return String(attribute.numberValue);
    if (attribute.booleanValue !== null)
      return attribute.booleanValue ? 'Có' : 'Không';
    if (attribute.dateValue !== null)
      return attribute.dateValue.toISOString().slice(0, 10);
    if (attribute.jsonValue !== null) {
      return Array.isArray(attribute.jsonValue)
        ? attribute.jsonValue.map(String).join(', ')
        : (JSON.stringify(attribute.jsonValue) ?? 'Chưa cập nhật');
    }
    return 'Chưa cập nhật';
  }

  private detailCategories(record: PublicProductRecord) {
    const values = new Map<
      string,
      {
        id: string;
        name: string;
        slug: string;
        imageUrl: string | null;
        sortOrder: number;
        children: [];
      }
    >();
    for (const { category } of record.categories) {
      if (category.parent?.isActive) {
        values.set(category.parent.id, { ...category.parent, children: [] });
      }
      values.set(category.id, {
        id: category.id,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        sortOrder: category.sortOrder,
        children: [],
      });
    }
    return [...values.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi'),
    );
  }
}
