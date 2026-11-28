import {
  Prisma,
  ProductMediaType,
  ProductStatus,
} from '@/generated/prisma/client';

export const activeCategoryWhere: Prisma.CategoryWhereInput = {
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
