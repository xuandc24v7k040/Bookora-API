import {
  Prisma,
  ProductStatus,
  StockReceiptStatus,
} from '../../../src/generated/prisma/client';
import { STOREFRONT_CATALOG_PRODUCTS } from './storefront-catalog.data';

const STOREFRONT_BRANCH_CODES = [
  'can-tho',
  'hau-giang',
  'ho-chi-minh',
  'ha-noi',
] as const;

type InventoryTransactionClient = Prisma.TransactionClient;

export type StorefrontInventorySeedRunner = {
  $transaction<T>(
    callback: (tx: InventoryTransactionClient) => Promise<T>,
  ): Promise<T>;
  branch: InventoryTransactionClient['branch'];
  product: InventoryTransactionClient['product'];
};

export type StorefrontInventorySeedSummary = {
  activeProducts: number;
  skippedDraftProducts: string[];
  createdReceipts: string[];
  preservedReceipts: string[];
};

export async function seedStorefrontInventoryDemo(
  prisma: StorefrontInventorySeedRunner,
): Promise<StorefrontInventorySeedSummary> {
  const branches = await prisma.branch.findMany({
    where: { code: { in: [...STOREFRONT_BRANCH_CODES] }, isActive: true },
    select: { id: true, code: true },
  });
  const branchByCode = new Map(branches.map((branch) => [branch.code, branch]));
  for (const code of STOREFRONT_BRANCH_CODES) {
    if (!branchByCode.has(code)) {
      throw new Error(`Required active storefront branch is missing: ${code}`);
    }
  }

  const definitionsBySlug = new Map(
    STOREFRONT_CATALOG_PRODUCTS.map((definition, index) => [
      definition.slug,
      { definition, index },
    ]),
  );
  const products = await prisma.product.findMany({
    where: { slug: { in: [...definitionsBySlug.keys()] } },
    select: {
      id: true,
      slug: true,
      status: true,
      variants: {
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }, { sku: 'asc' }],
        select: { id: true, sku: true, originalPrice: true },
      },
    },
  });

  const summary: StorefrontInventorySeedSummary = {
    activeProducts: 0,
    skippedDraftProducts: [],
    createdReceipts: [],
    preservedReceipts: [],
  };

  for (const product of products) {
    const indexed = definitionsBySlug.get(product.slug);
    if (!indexed) continue;
    if (
      product.status !== ProductStatus.ACTIVE ||
      product.variants.length === 0
    ) {
      summary.skippedDraftProducts.push(product.slug);
      continue;
    }
    summary.activeProducts += 1;

    for (const [branchIndex, code] of STOREFRONT_BRANCH_CODES.entries()) {
      const branch = branchByCode.get(code)!;
      const items = product.variants
        .map((variant, variantIndex) => ({
          variant,
          quantity: storefrontStockQuantity(
            indexed.index,
            branchIndex,
            variantIndex,
          ),
        }))
        .filter((item) => item.quantity > 0);
      if (items.length === 0) continue;

      const receiptCode = `DEMO-STOREFRONT-${code.toUpperCase()}-${product.slug.toUpperCase()}`;
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.stockReceipt.findUnique({
          where: { code: receiptCode },
          select: { id: true },
        });
        if (existing) return 'PRESERVED' as const;

        await tx.stockReceipt.create({
          data: {
            branchId: branch.id,
            code: receiptCode,
            status: StockReceiptStatus.CONFIRMED,
            note: 'Bookora storefront demo inventory seed',
            confirmedAt: new Date('2026-07-22T00:00:00.000Z'),
            items: {
              create: items.map(({ variant, quantity }) => ({
                variantId: variant.id,
                quantity,
                costPrice: variant.originalPrice.mul(0.6).round(),
              })),
            },
          },
        });
        for (const { variant, quantity } of items) {
          await tx.branchProductStock.upsert({
            where: {
              branchId_variantId: {
                branchId: branch.id,
                variantId: variant.id,
              },
            },
            create: {
              branchId: branch.id,
              variantId: variant.id,
              quantity,
              lowStockThreshold: 5,
            },
            update: { quantity: { increment: quantity } },
          });
        }
        return 'CREATED' as const;
      });
      if (result === 'CREATED') summary.createdReceipts.push(receiptCode);
      else summary.preservedReceipts.push(receiptCode);
    }
  }

  summary.skippedDraftProducts.sort();
  return summary;
}

export function storefrontStockQuantity(
  productIndex: number,
  branchIndex: number,
  variantIndex: number,
): number {
  if (branchIndex === 0) {
    if (variantIndex > 0 && productIndex % 2 === 0) return 0;
    return variantIndex === 0 ? 30 + (productIndex % 20) : 4;
  }
  if (productIndex % 6 === 0) return 24 + branchIndex * 6 + variantIndex;
  if (branchIndex === 1) {
    return (productIndex + variantIndex) % 3 === 0 ? 0 : 3;
  }
  if (branchIndex === 2) return 20 + ((productIndex + variantIndex) % 30);
  return productIndex % 2 === 0 ? 45 + variantIndex : 0;
}
