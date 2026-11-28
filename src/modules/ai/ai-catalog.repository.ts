import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import type { Prisma } from '@/generated/prisma/client';
import {
  activeCategoryWhere,
  publicProductVisibilityWhere,
} from '@/modules/storefront-catalog/storefront-product-visibility';
import type { SemanticProduct } from './ai.types';

const semanticProductSelect = {
  id: true,
  name: true,
  shortDescription: true,
  description: true,
  authors: { select: { author: { select: { name: true } } } },
  categories: {
    where: { category: activeCategoryWhere },
    select: {
      category: { select: { name: true, parent: { select: { name: true } } } },
    },
  },
  publisher: { select: { name: true } },
} satisfies Prisma.ProductSelect;

type Projection = Prisma.ProductGetPayload<{
  select: typeof semanticProductSelect;
}>;

function toSemanticProduct(product: Projection): SemanticProduct {
  return {
    id: product.id,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    authors: product.authors.map(({ author }) => author.name).sort(),
    categories: [
      ...new Set(
        product.categories.flatMap(({ category }) =>
          [category.name, category.parent?.name].filter(
            (name): name is string => Boolean(name),
          ),
        ),
      ),
    ].sort(),
    publisher: product.publisher?.name ?? null,
  };
}

@Injectable()
export class AiCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SemanticProduct[]> {
    const records = await this.prisma.product.findMany({
      where: publicProductVisibilityWhere,
      select: semanticProductSelect,
      orderBy: { id: 'asc' },
    });
    return records.map(toSemanticProduct);
  }

  async find(id: string): Promise<SemanticProduct | null> {
    const record = await this.prisma.product.findFirst({
      where: { ...publicProductVisibilityWhere, id },
      select: semanticProductSelect,
    });
    return record ? toSemanticProduct(record) : null;
  }
}
