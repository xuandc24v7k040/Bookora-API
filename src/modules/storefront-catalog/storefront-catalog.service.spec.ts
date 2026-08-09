import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { StorefrontAvailabilityStatus, StorefrontProductSort } from './dto';
import type { PublicProductRecord } from './storefront-catalog.repository';
import { StorefrontCatalogRepository } from './storefront-catalog.repository';
import { StorefrontCatalogService } from './storefront-catalog.service';
import { StorefrontPriceService } from './storefront-price.service';

const id = '01J00000000000000000000000';

function product(
  overrides: Partial<PublicProductRecord> = {},
): PublicProductRecord {
  return {
    id,
    name: 'Sách thử nghiệm',
    slug: 'sach-thu-nghiem',
    shortDescription: 'Mô tả ngắn',
    description: '<p>Mô tả</p>',
    releaseDate: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    publisher: { id, name: 'NXB Trẻ', slug: 'nxb-tre' },
    authors: [{ author: { id, name: 'Tác giả A', slug: 'tac-gia-a' } }],
    categories: [
      {
        isPrimary: true,
        category: {
          id,
          name: 'Tiểu thuyết',
          slug: 'tieu-thuyet',
          imageUrl: null,
          sortOrder: 1,
          parentId: '01J00000000000000000000001',
          parent: {
            id: '01J00000000000000000000001',
            name: 'Văn học',
            slug: 'van-hoc',
            imageUrl: null,
            sortOrder: 1,
            isActive: true,
          },
        },
      },
    ],
    media: [
      {
        id,
        url: 'https://example.com/book.webp',
        altText: null,
        sortOrder: 0,
        isPrimary: true,
      },
    ],
    options: [],
    variants: [
      {
        id,
        name: 'Mặc định',
        originalPrice: new Prisma.Decimal(100_000),
        salePrice: new Prisma.Decimal(80_000),
        saleStartAt: null,
        saleEndAt: null,
        isDefault: true,
        isbn: null,
        barcode: '8930000000012',
        publicationYear: 2026,
        pageCount: 200,
        weightGram: 300,
        packageSize: '14 x 20 cm',
        optionValues: [],
        media: [],
      },
    ],
    attributeValues: [
      {
        textValue: 'Tiếng Việt',
        numberValue: null,
        booleanValue: null,
        dateValue: null,
        jsonValue: null,
        attribute: { code: 'LANGUAGE', name: 'Ngôn ngữ' },
      },
    ],
    ...overrides,
  };
}

describe('StorefrontCatalogService', () => {
  const repository = {
    listCategories: jest.fn(),
    listProducts: jest.fn(),
    listProductPage: jest.fn(),
    listSearchSuggestions: jest.fn(),
    listProductsByIds: jest.fn(),
    completedSalesByProduct: jest.fn(),
    findProductBySlug: jest.fn(),
    listRelated: jest.fn(),
    findPublicVariants: jest.fn(),
    findAvailability: jest.fn(),
    ratingAggregates: jest.fn(),
  };
  const service = new StorefrontCatalogService(
    repository as unknown as StorefrontCatalogRepository,
    new StorefrontPriceService(),
  );

  beforeEach(() => {
    jest.resetAllMocks();
    repository.completedSalesByProduct.mockResolvedValue(new Map());
    repository.ratingAggregates.mockResolvedValue(new Map());
  });

  it('rejects an inverted price range with the public machine code', async () => {
    await expect(
      service.list({ priceMin: 200_000, priceMax: 100_000 }),
    ).rejects.toMatchObject({
      response: { code: 'PUBLIC_PRODUCT_PRICE_RANGE_INVALID' },
    });
  });

  it('paginates, sorts resolved prices and returns real facet counts', async () => {
    const lowerPriceProduct = product({
      id: '01J00000000000000000000002',
      name: 'Sách giá thấp',
      slug: 'sach-gia-thap',
      variants: [
        {
          ...product().variants[0],
          id: '01J00000000000000000000002',
          originalPrice: new Prisma.Decimal(60_000),
          salePrice: null,
        },
      ],
    });
    repository.listProductPage.mockResolvedValue({
      records: [lowerPriceProduct, product()],
      totalItems: 2,
      facets: {
        authors: [{ value: 'tac-gia-a', label: 'Tác giả A', count: 2 }],
        publishers: [],
        categories: [],
        attributes: [],
      },
    });

    const result = await service.list({
      page: 1,
      pageSize: 12,
      sort: StorefrontProductSort.PRICE_ASC,
    });

    expect(result.items.map((item) => item.slug)).toEqual([
      'sach-gia-thap',
      'sach-thu-nghiem',
    ]);
    expect(result.totalItems).toBe(2);
    expect(result.facets.authors).toContainEqual({
      value: 'tac-gia-a',
      label: 'Tác giả A',
      count: 2,
    });
    expect(result.items[1]?.price).toMatchObject({
      current: 80_000,
      onSale: true,
      discountPercent: 20,
    });
  });

  it('uses relevance by default only when a search query is present', async () => {
    repository.listProductPage.mockResolvedValue({
      records: [product()],
      totalItems: 1,
      facets: { authors: [], publishers: [], categories: [], attributes: [] },
    });

    const result = await service.list({ q: 'chu thuat' });

    expect(repository.listProductPage).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'chu thuat',
        sort: StorefrontProductSort.RELEVANCE,
      }),
      expect.any(Date),
    );
    expect(result.sort).toBe(StorefrontProductSort.RELEVANCE);
  });

  it('returns lightweight ranked suggestions with a total', async () => {
    repository.listSearchSuggestions.mockResolvedValue({
      records: [
        {
          product: product(),
          isBestMatch: true,
          isBestSeller: true,
        },
      ],
      totalItems: 4,
    });

    const result = await service.searchSuggestions({
      q: 'chu thuat',
      limit: 5,
    });

    expect(result.total).toBe(4);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id,
      slug: 'sach-thu-nghiem',
      isBestMatch: true,
      isBestSeller: false,
    });
  });

  it('maps a real bestseller badge when best-match priority does not apply', async () => {
    repository.listSearchSuggestions.mockResolvedValue({
      records: [
        {
          product: product(),
          isBestMatch: false,
          isBestSeller: true,
        },
      ],
      totalItems: 1,
    });

    const result = await service.searchSuggestions({ q: 'thuật', limit: 5 });

    expect(result.items[0]).toMatchObject({
      isBestMatch: false,
      isBestSeller: true,
    });
  });

  it('deduplicates and preserves requested order for product summaries', async () => {
    const secondId = '01J00000000000000000000002';
    const second = product({
      id: secondId,
      name: 'Sách thứ hai',
      slug: 'sach-thu-hai',
    });
    repository.listProductsByIds.mockResolvedValue([second, product()]);

    const result = await service.productSummaries({
      ids: [id, secondId, id],
    });

    expect(repository.listProductsByIds).toHaveBeenCalledWith([id, secondId]);
    expect(result.map((item) => item.id)).toEqual([id, secondId]);
  });

  it('returns public 404 instead of leaking why a product is hidden', async () => {
    repository.findProductBySlug.mockResolvedValue(null);
    await expect(service.detail('draft-product')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps detail variants, general media and related products without internal SKU fields', async () => {
    repository.findProductBySlug.mockResolvedValue(product());
    repository.listRelated.mockResolvedValue([
      product({ id: '01J00000000000000000000002', slug: 'lien-quan' }),
    ]);

    const detail = await service.detail('sach-thu-nghiem');

    expect(detail.generalMedia).toHaveLength(1);
    expect(detail.variants[0]?.media).toEqual([]);
    expect(detail.variants[0]?.barcode).toBe('8930000000012');
    expect(detail.relatedProducts[0]?.slug).toBe('lien-quan');
    expect(detail.primaryCategory).toEqual({
      id,
      name: 'Tiểu thuyết',
      slug: 'tieu-thuyet',
      parent: {
        id: '01J00000000000000000000001',
        name: 'Văn học',
        slug: 'van-hoc',
      },
    });
    expect(detail.variants[0]).not.toHaveProperty('sku');
    expect(detail.variants[0]).not.toHaveProperty('combinationKey');
  });

  it('keeps public categories and returns no primary category for legacy data', async () => {
    const legacyProduct = product({
      categories: product().categories.map((item) => ({
        ...item,
        isPrimary: false,
      })),
    });
    repository.findProductBySlug.mockResolvedValue(legacyProduct);
    repository.listRelated.mockResolvedValue([]);

    const detail = await service.detail(legacyProduct.slug);

    expect(detail.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id, slug: 'tieu-thuyet' }),
      ]),
    );
    expect(detail.primaryCategory).toBeNull();
  });

  it('returns stock status for the exact branch and selected variant', async () => {
    const otherId = '01H00000000000000000000001';
    repository.findPublicVariants.mockResolvedValue([
      { id, isDefault: true },
      { id: otherId, isDefault: false },
    ]);
    repository.findAvailability.mockResolvedValue({
      id,
      code: 'can-tho',
      name: 'Cần Thơ',
      isActive: true,
      stocks: [
        { variantId: id, quantity: 3, lowStockThreshold: 5 },
        { variantId: otherId, quantity: 0, lowStockThreshold: 5 },
      ],
    });

    await expect(service.availability(id, id, id)).resolves.toMatchObject({
      availableQuantity: 3,
      status: StorefrontAvailabilityStatus.LOW_STOCK,
      variantId: id,
      variants: [
        {
          variantId: id,
          availableQuantity: 3,
          status: StorefrontAvailabilityStatus.LOW_STOCK,
        },
        {
          variantId: otherId,
          availableQuantity: 0,
          status: StorefrontAvailabilityStatus.OUT_OF_STOCK,
        },
      ],
    });
  });

  it('treats a missing stock row as out of stock', async () => {
    repository.findPublicVariants.mockResolvedValue([{ id, isDefault: true }]);
    repository.findAvailability.mockResolvedValue({
      id,
      code: 'can-tho',
      name: 'Cần Thơ',
      isActive: true,
      stocks: [],
    });

    await expect(service.availability(id, id)).resolves.toMatchObject({
      availableQuantity: 0,
      status: StorefrontAvailabilityStatus.OUT_OF_STOCK,
    });
  });

  it('rejects missing, inactive and non-public availability contexts', async () => {
    await expect(service.availability(undefined, id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    repository.findPublicVariants.mockResolvedValue([]);
    await expect(service.availability(id, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    repository.findPublicVariants.mockResolvedValue([{ id, isDefault: true }]);
    repository.findAvailability.mockResolvedValue({
      id,
      code: 'x',
      name: 'X',
      isActive: false,
      stocks: [],
    });
    await expect(service.availability(id, id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
