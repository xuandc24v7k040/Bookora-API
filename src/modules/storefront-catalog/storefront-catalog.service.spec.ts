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
    completedSalesByProduct: jest.fn(),
    findProductBySlug: jest.fn(),
    listRelated: jest.fn(),
    findPublicVariant: jest.fn(),
    findAvailability: jest.fn(),
  };
  const service = new StorefrontCatalogService(
    repository as unknown as StorefrontCatalogRepository,
    new StorefrontPriceService(),
  );

  beforeEach(() => {
    jest.resetAllMocks();
    repository.completedSalesByProduct.mockResolvedValue(new Map());
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
    expect(detail.relatedProducts[0]?.slug).toBe('lien-quan');
    expect(detail.variants[0]).not.toHaveProperty('sku');
    expect(detail.variants[0]).not.toHaveProperty('combinationKey');
  });

  it('returns stock status for the exact branch and selected variant', async () => {
    repository.findPublicVariant.mockResolvedValue({ id });
    repository.findAvailability.mockResolvedValue({
      id,
      code: 'can-tho',
      name: 'Cần Thơ',
      isActive: true,
      stocks: [{ variantId: id, quantity: 3, lowStockThreshold: 5 }],
    });

    await expect(service.availability(id, id, id)).resolves.toMatchObject({
      availableQuantity: 3,
      status: StorefrontAvailabilityStatus.LOW_STOCK,
      variantId: id,
    });
  });

  it('treats a missing stock row as out of stock', async () => {
    repository.findPublicVariant.mockResolvedValue({ id });
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
    repository.findPublicVariant.mockResolvedValue(null);
    await expect(service.availability(id, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    repository.findPublicVariant.mockResolvedValue({ id });
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
