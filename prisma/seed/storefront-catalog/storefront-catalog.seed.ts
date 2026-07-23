import {
  Prisma,
  ProductOptionPresentationType,
  ProductStatus,
} from '../../../src/generated/prisma/client';
import { toSlug } from '../../../src/common/utils/slug.util';
import {
  STOREFRONT_CATALOG_PRODUCTS,
  STOREFRONT_CATEGORY_SLUGS,
} from './storefront-catalog.data';
import type { StorefrontProductDefinition } from './storefront-catalog.data';
import {
  normalizeSeedName,
  storefrontCombinationKey,
  storefrontMoney,
  storefrontSaleDates,
} from './storefront-catalog.helpers';

type CatalogTransactionClient = Prisma.TransactionClient;

export type StorefrontCatalogSeedRunner = {
  $transaction<T>(
    callback: (tx: CatalogTransactionClient) => Promise<T>,
  ): Promise<T>;
};

export type StorefrontCatalogSeedSummary = {
  created: string[];
  preserved: string[];
  conflicts: string[];
};

export async function seedStorefrontCatalogDemo(
  prisma: StorefrontCatalogSeedRunner,
): Promise<StorefrontCatalogSeedSummary> {
  const summary: StorefrontCatalogSeedSummary = {
    created: [],
    preserved: [],
    conflicts: [],
  };

  for (const definition of STOREFRONT_CATALOG_PRODUCTS) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { slug: definition.slug },
        select: {
          name: true,
          categories: { select: { category: { select: { slug: true } } } },
          variants: { select: { id: true } },
        },
      });
      if (existing) {
        if (
          normalizeSeedName(existing.name) !==
          normalizeSeedName(definition.name)
        ) {
          throw new Error(
            `Storefront seed identity conflict for ${definition.slug}: existing product name is ${existing.name}`,
          );
        }
        const categoryMatches = existing.categories.some(
          ({ category }) => category.slug === definition.categorySlug,
        );
        if (!categoryMatches || existing.variants.length === 0) {
          summary.conflicts.push(definition.slug);
        }
        summary.preserved.push(definition.slug);
        return;
      }

      await createProductAggregate(tx, definition);
      summary.created.push(definition.slug);
    });
  }

  return summary;
}

async function createProductAggregate(
  tx: CatalogTransactionClient,
  definition: StorefrontProductDefinition,
): Promise<void> {
  const category = await tx.category.findFirst({
    where: {
      slug: definition.categorySlug,
      isActive: true,
      parent: { is: { name: { in: ['Văn học', 'Kinh tế'] }, isActive: true } },
    },
    select: { id: true },
  });
  if (!category) {
    throw new Error(
      `Required active storefront category is missing: ${definition.categorySlug}`,
    );
  }

  const authorIds = await Promise.all(
    definition.authors.map((author) => resolveAuthor(tx, author)),
  );
  const publisherId = await resolvePublisher(tx, definition.publisher);
  const attributes = await resolveAttributes(tx);

  const created = await tx.product.create({
    data: {
      name: definition.name,
      slug: definition.slug,
      shortDescription: definition.shortDescription,
      description: definition.description,
      publisherId,
      status: ProductStatus.DRAFT,
      releaseDate: new Date(definition.releaseDate),
      categories: { create: { categoryId: category.id, isPrimary: true } },
      authors: { create: authorIds.map((authorId) => ({ authorId })) },
      attributeValues: {
        create: [
          { attributeId: attributes.LANGUAGE, textValue: 'Tiếng Việt' },
          {
            attributeId: attributes.PAGE_COUNT,
            numberValue: storefrontMoney(definition.pageCount),
          },
          {
            attributeId: attributes.PUBLICATION_DATE,
            dateValue: new Date(definition.releaseDate),
          },
        ],
      },
    },
    select: { id: true },
  });

  let option:
    | {
        id: string;
        values: Array<{ id: string; value: string }>;
      }
    | undefined;
  if (definition.option) {
    option = await tx.productOption.create({
      data: {
        productId: created.id,
        name: definition.option.name,
        code: definition.option.code,
        presentationType: ProductOptionPresentationType.TEXT,
        sortOrder: 10,
        values: {
          create: definition.option.values.map((value, index) => ({
            label: value.label,
            value: value.value,
            sortOrder: (index + 1) * 10,
          })),
        },
      },
      select: { id: true, values: { select: { id: true, value: true } } },
    });
  }

  const saleDates = storefrontSaleDates(definition.saleState);
  for (const [index, variant] of definition.variants.entries()) {
    const optionValue = option
      ? option.values.find((value) => value.value === variant.optionValue)
      : undefined;
    if (option && !optionValue) {
      throw new Error(
        `Unknown option value ${variant.optionValue ?? '(missing)'} for ${definition.slug}`,
      );
    }
    await tx.productVariant.create({
      data: {
        productId: created.id,
        name: variant.name,
        sku: variant.sku,
        isbn: variant.isbn ?? null,
        combinationKey: storefrontCombinationKey(
          definition,
          variant.optionValue,
        ),
        publicationYear: definition.publicationYear,
        pageCount: definition.pageCount,
        weightGram: definition.weightGram,
        packageSize: definition.packageSize,
        originalPrice: storefrontMoney(variant.originalPrice),
        salePrice:
          variant.salePrice === undefined
            ? null
            : storefrontMoney(variant.salePrice),
        ...saleDates,
        isDefault: variant.isDefault ?? index === 0,
        isActive: true,
        optionValues:
          option && optionValue
            ? {
                create: {
                  optionId: option.id,
                  optionValueId: optionValue.id,
                },
              }
            : undefined,
      },
    });
  }
}

async function resolveAuthor(
  tx: CatalogTransactionClient,
  rawName: string,
): Promise<string> {
  const name = normalizeSeedName(rawName);
  const slug = toSlug(name);
  const existing = await tx.author.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (existing) return existing.id;
  const created = await tx.author.create({
    data: { name, slug },
    select: { id: true },
  });
  return created.id;
}

async function resolvePublisher(
  tx: CatalogTransactionClient,
  rawName: string,
): Promise<string> {
  const name = normalizeSeedName(rawName);
  const slug = toSlug(name);
  const existing = await tx.publisher.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.publisher.create({
    data: { name, slug },
    select: { id: true },
  });
  return created.id;
}

async function resolveAttributes(tx: CatalogTransactionClient): Promise<{
  LANGUAGE: string;
  PAGE_COUNT: string;
  PUBLICATION_DATE: string;
}> {
  const requiredCodes = ['LANGUAGE', 'PAGE_COUNT', 'PUBLICATION_DATE'] as const;
  const rows = await tx.productAttribute.findMany({
    where: { code: { in: [...requiredCodes] } },
    select: { id: true, code: true },
  });
  const byCode = new Map(rows.map((row) => [row.code, row.id]));
  for (const code of requiredCodes) {
    if (!byCode.has(code)) {
      throw new Error(`Required product attribute is missing: ${code}`);
    }
  }
  return {
    LANGUAGE: byCode.get('LANGUAGE')!,
    PAGE_COUNT: byCode.get('PAGE_COUNT')!,
    PUBLICATION_DATE: byCode.get('PUBLICATION_DATE')!,
  };
}

export function isStorefrontCategorySlug(slug: string): boolean {
  return (STOREFRONT_CATEGORY_SLUGS as readonly string[]).includes(slug);
}
