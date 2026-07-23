import {
  STOREFRONT_CATALOG_PRODUCTS,
  STOREFRONT_CATEGORY_SLUGS,
  STOREFRONT_SALE_PERIODS,
} from '../../../prisma/seed/storefront-catalog/storefront-catalog.data';
import { storefrontCombinationKey } from '../../../prisma/seed/storefront-catalog/storefront-catalog.helpers';
import {
  seedStorefrontInventoryDemo,
  storefrontStockQuantity,
  type StorefrontInventorySeedRunner,
} from '../../../prisma/seed/storefront-catalog/storefront-inventory.seed';
import { Prisma, ProductStatus } from '../../../src/generated/prisma/client';

const RESEARCH_DATE = new Date('2026-07-22T00:00:00.000Z');

describe('storefront demo catalog seed dataset', () => {
  it('contains exactly 24 products across the eight required child categories', () => {
    expect(STOREFRONT_CATALOG_PRODUCTS).toHaveLength(24);
    expect(
      new Set(STOREFRONT_CATALOG_PRODUCTS.map(({ slug }) => slug)).size,
    ).toBe(24);
    expect(
      STOREFRONT_CATALOG_PRODUCTS.filter(({ categorySlug }) =>
        categorySlug.startsWith('van-hoc-'),
      ),
    ).toHaveLength(12);
    expect(
      STOREFRONT_CATALOG_PRODUCTS.filter(({ categorySlug }) =>
        categorySlug.startsWith('kinh-te-'),
      ),
    ).toHaveLength(12);
    for (const categorySlug of STOREFRONT_CATEGORY_SLUGS) {
      expect(
        STOREFRONT_CATALOG_PRODUCTS.filter(
          (product) => product.categorySlug === categorySlug,
        ),
      ).toHaveLength(3);
    }
  });

  it('contains 20 SIMPLE and four complete OPTIONED aggregates', () => {
    const optioned = STOREFRONT_CATALOG_PRODUCTS.filter(
      (product) => product.option,
    );
    expect(optioned).toHaveLength(4);
    expect(STOREFRONT_CATALOG_PRODUCTS.length - optioned.length).toBe(20);

    const skus = new Set<string>();
    for (const product of STOREFRONT_CATALOG_PRODUCTS) {
      const defaultVariants = product.variants.filter(
        (variant, index) => variant.isDefault ?? index === 0,
      );
      expect(defaultVariants).toHaveLength(1);
      expect(product.variants.length).toBe(product.option ? 2 : 1);
      const combinations = product.variants.map((variant) =>
        storefrontCombinationKey(product, variant.optionValue),
      );
      expect(new Set(combinations).size).toBe(combinations.length);
      if (!product.option) expect(combinations).toEqual(['DEFAULT']);
      for (const variant of product.variants) {
        expect(skus.has(variant.sku)).toBe(false);
        skus.add(variant.sku);
        if (product.option) {
          expect(
            product.option.values.some(
              (optionValue) => optionValue.value === variant.optionValue,
            ),
          ).toBe(true);
        }
      }
    }
  });

  it('has six active sales, one future sale, one expired sale and valid prices', () => {
    expect(
      STOREFRONT_CATALOG_PRODUCTS.filter(
        ({ saleState }) => saleState === 'ACTIVE',
      ),
    ).toHaveLength(6);
    expect(
      STOREFRONT_CATALOG_PRODUCTS.filter(
        ({ saleState }) => saleState === 'FUTURE',
      ),
    ).toHaveLength(1);
    expect(
      STOREFRONT_CATALOG_PRODUCTS.filter(
        ({ saleState }) => saleState === 'EXPIRED',
      ),
    ).toHaveLength(1);
    expect(
      STOREFRONT_CATALOG_PRODUCTS.filter(
        ({ saleState }) => saleState === 'NONE',
      ),
    ).toHaveLength(16);

    expect(
      new Date(STOREFRONT_SALE_PERIODS.ACTIVE.startAt) < RESEARCH_DATE,
    ).toBe(true);
    expect(new Date(STOREFRONT_SALE_PERIODS.ACTIVE.endAt) > RESEARCH_DATE).toBe(
      true,
    );
    expect(
      new Date(STOREFRONT_SALE_PERIODS.FUTURE.startAt) > RESEARCH_DATE,
    ).toBe(true);
    expect(
      new Date(STOREFRONT_SALE_PERIODS.EXPIRED.endAt) < RESEARCH_DATE,
    ).toBe(true);

    for (const product of STOREFRONT_CATALOG_PRODUCTS) {
      for (const variant of product.variants) {
        expect(Number.isInteger(variant.originalPrice)).toBe(true);
        expect(variant.originalPrice).toBeGreaterThan(0);
        if (product.saleState === 'NONE') {
          expect(variant.salePrice).toBeUndefined();
        } else {
          expect(variant.salePrice).toBeGreaterThan(0);
          expect(variant.salePrice).toBeLessThan(variant.originalPrice);
        }
      }
    }
  });

  it('has four deterministic future releases and complete book metadata', () => {
    expect(
      STOREFRONT_CATALOG_PRODUCTS.filter(
        ({ releaseDate }) => new Date(releaseDate) > RESEARCH_DATE,
      ),
    ).toHaveLength(4);
    for (const product of STOREFRONT_CATALOG_PRODUCTS) {
      expect(product.authors.length).toBeGreaterThan(0);
      expect(product.publisher).toBeTruthy();
      expect(product.shortDescription).toBeTruthy();
      expect(product.description).toBeTruthy();
      expect(product.pageCount).toBeGreaterThan(0);
      expect(product.weightGram).toBeGreaterThan(0);
      expect(product.packageSize).toBeTruthy();
      expect(Number.isNaN(new Date(product.releaseDate).getTime())).toBe(false);
    }
  });

  it('defines deterministic in-stock, low-stock and out-of-stock scenarios', () => {
    const quantities = STOREFRONT_CATALOG_PRODUCTS.flatMap(
      (product, productIndex) =>
        [0, 1, 2, 3].flatMap((branchIndex) =>
          product.variants.map((_, variantIndex) =>
            storefrontStockQuantity(productIndex, branchIndex, variantIndex),
          ),
        ),
    );
    expect(quantities.some((quantity) => quantity === 0)).toBe(true);
    expect(quantities.some((quantity) => quantity > 0 && quantity <= 5)).toBe(
      true,
    );
    expect(quantities.some((quantity) => quantity > 5)).toBe(true);

    const firstOptioned = STOREFRONT_CATALOG_PRODUCTS.findIndex(
      (product) => product.option,
    );
    expect(storefrontStockQuantity(firstOptioned, 0, 0)).toBeGreaterThan(0);
    expect(storefrontStockQuantity(firstOptioned, 0, 1)).toBe(0);

    expect(
      [0, 1, 2, 3].every(
        (branchIndex) => storefrontStockQuantity(0, branchIndex, 0) > 0,
      ),
    ).toBe(true);
  });

  it('preserves deterministic inventory receipts without incrementing stock again', async () => {
    const branches = ['can-tho', 'hau-giang', 'ho-chi-minh', 'ha-noi'].map(
      (code) => ({ id: `branch-${code}`, code }),
    );
    const stockReceipt = {
      findUnique: jest.fn().mockResolvedValue({ id: 'existing-receipt' }),
      create: jest.fn(),
    };
    const branchProductStock = { upsert: jest.fn() };
    const tx = { stockReceipt, branchProductStock };
    const runner = {
      branch: { findMany: jest.fn().mockResolvedValue(branches) },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-1',
            slug: STOREFRONT_CATALOG_PRODUCTS[0].slug,
            status: ProductStatus.ACTIVE,
            variants: [
              {
                id: 'variant-1',
                sku: 'DEMO-VH-NGK-PB',
                originalPrice: new Prisma.Decimal(95000),
              },
            ],
          },
        ]),
      },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    } as unknown as StorefrontInventorySeedRunner;

    const summary = await seedStorefrontInventoryDemo(runner);

    expect(summary.activeProducts).toBe(1);
    expect(summary.createdReceipts).toHaveLength(0);
    expect(summary.preservedReceipts).toHaveLength(4);
    expect(stockReceipt.create).not.toHaveBeenCalled();
    expect(branchProductStock.upsert).not.toHaveBeenCalled();
  });
});
