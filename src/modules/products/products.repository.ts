import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import {
  Prisma,
  ProductAttributeType,
  ProductMediaType,
  ProductStatus,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { toSlug } from '@/common/utils/slug.util';
import type {
  BulkCreateProductVariantsDto,
  CreateProductDto,
  CreateProductOptionDto,
  CreateProductOptionValueDto,
  CreateProductVariantDto,
  ProductAttributeValueInputDto,
  UpdateProductDto,
  UpdateProductOptionDto,
  UpdateProductOptionValueDto,
  UpdateProductVariantDto,
} from './dto';
import {
  MAX_VARIANT_COMBINATIONS,
  ProductDomainError,
} from './products.constants';
import { sanitizeProductDescription } from './product-description.util';

const relationSummarySelect = { id: true, name: true } as const;

export const productListSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  releaseDate: true,
  supplier: { select: relationSummarySelect },
  publisher: { select: relationSummarySelect },
  categories: {
    orderBy: { category: { name: 'asc' as const } },
    select: { category: { select: relationSummarySelect } },
  },
  authors: {
    orderBy: { author: { name: 'asc' as const } },
    select: { author: { select: relationSummarySelect } },
  },
  variants: {
    orderBy: [{ isDefault: 'desc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      name: true,
      sku: true,
      originalPrice: true,
      salePrice: true,
      isDefault: true,
      isActive: true,
    },
  },
  _count: { select: { options: true, variants: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

export const productDetailSelect = {
  ...productListSelect,
  shortDescription: true,
  description: true,
  attributeValues: {
    orderBy: { attribute: { name: 'asc' as const } },
    select: {
      id: true,
      attributeId: true,
      textValue: true,
      numberValue: true,
      booleanValue: true,
      dateValue: true,
      jsonValue: true,
      attribute: { select: { name: true, code: true, type: true } },
    },
  },
} satisfies Prisma.ProductSelect;

export const productOptionSelect = {
  id: true,
  productId: true,
  name: true,
  code: true,
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
      _count: { select: { variantLinks: true } },
    },
  },
  _count: { select: { links: true } },
} satisfies Prisma.ProductOptionSelect;

export const productVariantSelect = {
  id: true,
  productId: true,
  name: true,
  sku: true,
  barcode: true,
  combinationKey: true,
  isbn: true,
  publicationYear: true,
  pageCount: true,
  weightGram: true,
  packageSize: true,
  originalPrice: true,
  salePrice: true,
  saleStartAt: true,
  saleEndAt: true,
  isDefault: true,
  isActive: true,
  optionValues: {
    orderBy: [
      { option: { sortOrder: 'asc' as const } },
      { optionId: 'asc' as const },
    ],
    select: {
      optionId: true,
      optionValueId: true,
      option: { select: { name: true, code: true } },
      optionValue: { select: { label: true, value: true } },
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductVariantSelect;

export type ProductListRecord = Prisma.ProductGetPayload<{
  select: typeof productListSelect;
}>;
export type ProductDetailRecord = Prisma.ProductGetPayload<{
  select: typeof productDetailSelect;
}>;
export type ProductOptionRecord = Prisma.ProductOptionGetPayload<{
  select: typeof productOptionSelect;
}>;
export type ProductVariantRecord = Prisma.ProductVariantGetPayload<{
  select: typeof productVariantSelect;
}>;

type PreparedVariant = {
  data: Omit<
    CreateProductVariantDto,
    | 'optionValueIds'
    | 'originalPrice'
    | 'salePrice'
    | 'saleStartAt'
    | 'saleEndAt'
  > & {
    originalPrice: Prisma.Decimal;
    salePrice: Prisma.Decimal | null;
    saleStartAt: Date | null;
    saleEndAt: Date | null;
  };
  combinationKey: string;
  links: Array<{ optionId: string; optionValueId: string }>;
};

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(
    where: Prisma.ProductWhereInput,
    orderBy: Prisma.ProductOrderByWithRelationInput[],
    skip: number,
    take: number,
  ) {
    return Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip,
        take,
        select: productListSelect,
      }),
      this.prisma.product.count({ where }),
    ]);
  }

  findById(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      select: productDetailSelect,
    });
  }

  async create(dto: CreateProductDto) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const normalized = await this.prepareProductInput(tx, dto);
      await this.assertProductNameAvailable(tx, normalized, undefined);
      const slug = await this.availableSlug(tx, normalized.name);
      return tx.product.create({
        data: {
          name: normalized.name,
          slug,
          description: normalized.description,
          shortDescription: normalized.shortDescription,
          supplierId: normalized.supplierId,
          publisherId: normalized.publisherId,
          releaseDate: normalized.releaseDate,
          status: ProductStatus.DRAFT,
          categories: {
            create: normalized.categoryIds.map((categoryId) => ({
              categoryId,
            })),
          },
          authors: {
            create: normalized.authorIds.map((authorId) => ({ authorId })),
          },
          attributeValues: { create: normalized.attributeValues },
        },
        select: productDetailSelect,
      });
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.product.findUnique({
        where: { id },
        select: productDetailSelect,
      });
      if (!current) return null;
      const normalized = await this.prepareProductInput(tx, dto, current);
      await this.assertProductNameAvailable(tx, normalized, id);
      const nameChanged =
        dto.name !== undefined && normalized.name !== current.name;

      return tx.product.update({
        where: { id },
        data: {
          ...(dto.name === undefined ? {} : { name: normalized.name }),
          ...(nameChanged
            ? { slug: await this.availableSlug(tx, normalized.name, id) }
            : {}),
          ...(dto.description === undefined
            ? {}
            : { description: normalized.description }),
          ...(dto.shortDescription === undefined
            ? {}
            : { shortDescription: normalized.shortDescription }),
          ...(dto.supplierId === undefined
            ? {}
            : { supplierId: normalized.supplierId }),
          ...(dto.publisherId === undefined
            ? {}
            : { publisherId: normalized.publisherId }),
          ...(dto.releaseDate === undefined
            ? {}
            : { releaseDate: normalized.releaseDate }),
          ...(dto.categoryIds === undefined
            ? {}
            : {
                categories: {
                  deleteMany: {},
                  create: normalized.categoryIds.map((categoryId) => ({
                    categoryId,
                  })),
                },
              }),
          ...(dto.authorIds === undefined
            ? {}
            : {
                authors: {
                  deleteMany: {},
                  create: normalized.authorIds.map((authorId) => ({
                    authorId,
                  })),
                },
              }),
          ...(dto.attributeValues === undefined
            ? {}
            : {
                attributeValues: {
                  deleteMany: {},
                  create: normalized.attributeValues,
                },
              }),
        },
        select: productDetailSelect,
      });
    });
  }

  async updateStatus(id: string, status: ProductStatus) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const product = await tx.product.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          categories: { select: { categoryId: true } },
          media: {
            select: {
              id: true,
              productId: true,
              variantId: true,
              type: true,
              isPrimary: true,
            },
          },
          options: { select: { id: true } },
          variants: {
            select: {
              id: true,
              isActive: true,
              isDefault: true,
              combinationKey: true,
              originalPrice: true,
              salePrice: true,
              saleStartAt: true,
              saleEndAt: true,
              optionValues: { select: { optionId: true } },
            },
          },
        },
      });
      if (!product) return null;
      if (status === ProductStatus.ACTIVE) {
        const active = product.variants.filter((variant) => variant.isActive);
        if (
          active.length === 0 ||
          active.filter((variant) => variant.isDefault).length !== 1
        ) {
          throw new ProductDomainError('PRODUCT_DEFAULT_VARIANT_REQUIRED');
        }
        if (product.categories.length === 0)
          throw new ProductDomainError(
            'PRODUCT_CONFIGURATION_INVALID',
            'Sản phẩm cần có ít nhất một danh mục',
          );
        for (const variant of active) {
          if (product.options.length === 0) {
            if (
              variant.combinationKey !== 'DEFAULT' ||
              variant.optionValues.length !== 0
            )
              throw new ProductDomainError('PRODUCT_CONFIGURATION_INVALID');
          } else if (variant.optionValues.length !== product.options.length) {
            throw new ProductDomainError('PRODUCT_VARIANT_INCOMPLETE_OPTIONS');
          }
          this.assertPrice({
            originalPrice: variant.originalPrice.toString(),
            salePrice: variant.salePrice?.toString() ?? null,
            saleStartAt: variant.saleStartAt?.toISOString() ?? null,
            saleEndAt: variant.saleEndAt?.toISOString() ?? null,
          });
        }
        const generalMedia = product.media.filter(
          (media) => media.variantId === null,
        );
        if (generalMedia.length === 0)
          throw new ProductDomainError('PRODUCT_MEDIA_REQUIRED');
        if (generalMedia.filter((media) => media.isPrimary).length !== 1)
          throw new ProductDomainError('PRODUCT_MEDIA_PRIMARY_REQUIRED');

        const variantIds = new Set(
          product.variants.map((variant) => variant.id),
        );
        const variantMedia = new Map<string, typeof product.media>();
        for (const media of product.media) {
          if (
            media.productId !== product.id ||
            media.type !== ProductMediaType.IMAGE
          ) {
            throw new ProductDomainError('PRODUCT_MEDIA_CONFIGURATION_INVALID');
          }
          if (!media.variantId) continue;
          if (!variantIds.has(media.variantId))
            throw new ProductDomainError(
              'PRODUCT_MEDIA_VARIANT_SCOPE_MISMATCH',
            );
          const gallery = variantMedia.get(media.variantId) ?? [];
          gallery.push(media);
          variantMedia.set(media.variantId, gallery);
        }
        for (const gallery of variantMedia.values()) {
          if (gallery.filter((media) => media.isPrimary).length !== 1)
            throw new ProductDomainError('PRODUCT_MEDIA_PRIMARY_REQUIRED');
        }
      }
      return tx.product.update({
        where: { id },
        data: { status },
        select: productDetailSelect,
      });
    });
  }

  async remove(id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const product = await tx.product.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          _count: { select: { reviews: true, wishlists: true } },
          variants: {
            select: {
              _count: {
                select: {
                  stocks: true,
                  receiptItems: true,
                  cartItems: true,
                  orderItems: true,
                },
              },
            },
          },
        },
      });
      if (!product) return null;
      if (product.status !== ProductStatus.DRAFT)
        throw new ProductDomainError('PRODUCT_DELETE_REQUIRES_DRAFT');
      const counts = product.variants.reduce(
        (sum, variant) => ({
          stocks: sum.stocks + variant._count.stocks,
          receiptItems: sum.receiptItems + variant._count.receiptItems,
          cartItems: sum.cartItems + variant._count.cartItems,
          orderItems: sum.orderItems + variant._count.orderItems,
        }),
        {
          stocks: 0,
          receiptItems: 0,
          cartItems: 0,
          orderItems: 0,
        },
      );
      const blockers = { ...product._count, ...counts };
      if (Object.values(blockers).some((count) => count > 0)) {
        throw new ProductDomainError(
          'PRODUCT_DELETE_BLOCKED_BY_REFERENCES',
          undefined,
          blockers,
        );
      }
      await tx.product.delete({ where: { id } });
      return { id, deleted: true };
    });
  }

  listOptions(productId: string) {
    return this.prisma.productOption.findMany({
      where: { productId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: productOptionSelect,
    });
  }

  async createOption(productId: string, dto: CreateProductOptionDto) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await this.assertProductExists(tx, productId);
      const defaultVariant = await tx.productVariant.count({
        where: { productId, combinationKey: 'DEFAULT' },
      });
      if (defaultVariant > 0)
        throw new ProductDomainError(
          'PRODUCT_CONFIGURATION_INVALID',
          'Hãy xóa cấu hình biến thể mặc định trước khi thêm lựa chọn',
        );
      return tx.productOption.create({
        data: { productId, ...dto },
        select: productOptionSelect,
      });
    });
  }

  async updateOption(
    productId: string,
    optionId: string,
    dto: UpdateProductOptionDto,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const option = await tx.productOption.findFirst({
        where: { id: optionId, productId },
        select: productOptionSelect,
      });
      if (!option) return null;
      if (
        dto.code !== undefined &&
        dto.code !== option.code &&
        option._count.links > 0
      ) {
        throw new ProductDomainError('PRODUCT_OPTION_CODE_IMMUTABLE_WHEN_USED');
      }
      return tx.productOption.update({
        where: { id: optionId },
        data: dto,
        select: productOptionSelect,
      });
    });
  }

  async removeOption(productId: string, optionId: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const option = await tx.productOption.findFirst({
        where: { id: optionId, productId },
        select: productOptionSelect,
      });
      if (!option) return null;
      if (option._count.links > 0)
        throw new ProductDomainError('PRODUCT_OPTION_IN_USE');
      await tx.productOption.delete({ where: { id: optionId } });
      return option;
    });
  }

  async createOptionValue(
    productId: string,
    optionId: string,
    dto: CreateProductOptionValueDto,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await this.assertOptionExists(tx, productId, optionId);
      return tx.productOptionValue.create({
        data: {
          optionId,
          label: dto.label,
          value: dto.value,
          colorCode: dto.colorCode,
          sortOrder: dto.sortOrder,
        },
        select: {
          id: true,
          label: true,
          value: true,
          colorCode: true,
          imageUrl: true,
          sortOrder: true,
          _count: { select: { variantLinks: true } },
        },
      });
    });
  }

  async updateOptionValue(
    productId: string,
    optionId: string,
    valueId: string,
    dto: UpdateProductOptionValueDto,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const value = await tx.productOptionValue.findFirst({
        where: { id: valueId, optionId, option: { productId } },
        select: {
          id: true,
          label: true,
          value: true,
          colorCode: true,
          imageUrl: true,
          sortOrder: true,
          _count: { select: { variantLinks: true } },
        },
      });
      if (!value) return null;
      if (
        dto.value !== undefined &&
        dto.value !== value.value &&
        value._count.variantLinks > 0
      ) {
        throw new ProductDomainError(
          'PRODUCT_OPTION_VALUE_IMMUTABLE_WHEN_USED',
        );
      }
      return tx.productOptionValue.update({
        where: { id: valueId },
        data: dto,
        select: {
          id: true,
          label: true,
          value: true,
          colorCode: true,
          imageUrl: true,
          sortOrder: true,
          _count: { select: { variantLinks: true } },
        },
      });
    });
  }

  async removeOptionValue(
    productId: string,
    optionId: string,
    valueId: string,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const value = await tx.productOptionValue.findFirst({
        where: { id: valueId, optionId, option: { productId } },
        select: {
          id: true,
          label: true,
          value: true,
          colorCode: true,
          imageUrl: true,
          sortOrder: true,
          _count: { select: { variantLinks: true } },
        },
      });
      if (!value) return null;
      if (value._count.variantLinks > 0)
        throw new ProductDomainError('PRODUCT_OPTION_VALUE_IN_USE');
      await tx.productOptionValue.delete({ where: { id: valueId } });
      return value;
    });
  }

  listVariants(productId: string) {
    return this.prisma.productVariant.findMany({
      where: { productId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: productVariantSelect,
    });
  }

  findVariant(productId: string, variantId: string) {
    return this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      select: productVariantSelect,
    });
  }

  async createVariant(productId: string, dto: CreateProductVariantDto) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const prepared = await this.prepareVariant(tx, productId, dto);
      return this.persistVariant(tx, productId, prepared);
    });
  }

  async bulkCreateVariants(
    productId: string,
    dto: BulkCreateProductVariantsDto,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await this.assertProductExists(tx, productId);
      const prepared = await Promise.all(
        dto.variants.map((variant) =>
          this.prepareVariant(tx, productId, variant),
        ),
      );
      const skus = prepared.map((item) => item.data.sku);
      const combinations = prepared.map((item) => item.combinationKey);
      if (new Set(skus).size !== skus.length)
        throw new ProductDomainError(
          'PRODUCT_VARIANT_SKU_ALREADY_EXISTS',
          'Batch có SKU trùng lặp',
        );
      if (new Set(combinations).size !== combinations.length)
        throw new ProductDomainError(
          'PRODUCT_VARIANT_COMBINATION_ALREADY_EXISTS',
          'Batch có tổ hợp trùng lặp',
        );
      const [skuCount, combinationCount, currentDefault] = await Promise.all([
        tx.productVariant.count({ where: { sku: { in: skus } } }),
        tx.productVariant.count({
          where: { productId, combinationKey: { in: combinations } },
        }),
        tx.productVariant.count({
          where: { productId, isDefault: true, isActive: true },
        }),
      ]);
      if (skuCount > 0)
        throw new ProductDomainError('PRODUCT_VARIANT_SKU_ALREADY_EXISTS');
      if (combinationCount > 0)
        throw new ProductDomainError(
          'PRODUCT_VARIANT_COMBINATION_ALREADY_EXISTS',
        );
      const requestedDefaults = prepared.filter(
        (item) => item.data.isDefault && item.data.isActive,
      ).length;
      if (
        requestedDefaults > 1 ||
        (currentDefault === 0 && requestedDefaults !== 1)
      )
        throw new ProductDomainError('PRODUCT_DEFAULT_VARIANT_REQUIRED');
      const results: ProductVariantRecord[] = [];
      for (const item of prepared)
        results.push(await this.persistVariant(tx, productId, item));
      return results;
    });
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.productVariant.findFirst({
        where: { id: variantId, productId },
        select: productVariantSelect,
      });
      if (!current) return null;
      const merged: CreateProductVariantDto = {
        name: dto.name ?? current.name,
        sku: dto.sku ?? current.sku,
        barcode: dto.barcode === undefined ? current.barcode : dto.barcode,
        isbn: dto.isbn === undefined ? current.isbn : dto.isbn,
        publicationYear:
          dto.publicationYear === undefined
            ? current.publicationYear
            : dto.publicationYear,
        pageCount:
          dto.pageCount === undefined ? current.pageCount : dto.pageCount,
        weightGram:
          dto.weightGram === undefined ? current.weightGram : dto.weightGram,
        packageSize:
          dto.packageSize === undefined ? current.packageSize : dto.packageSize,
        originalPrice: dto.originalPrice ?? current.originalPrice.toString(),
        salePrice:
          dto.salePrice === undefined
            ? (current.salePrice?.toString() ?? null)
            : dto.salePrice,
        saleStartAt:
          dto.saleStartAt === undefined
            ? (current.saleStartAt?.toISOString() ?? null)
            : dto.saleStartAt,
        saleEndAt:
          dto.saleEndAt === undefined
            ? (current.saleEndAt?.toISOString() ?? null)
            : dto.saleEndAt,
        isDefault: dto.isDefault ?? current.isDefault,
        isActive: dto.isActive ?? current.isActive,
        optionValueIds:
          dto.optionValueIds ??
          current.optionValues.map((item) => item.optionValueId),
      };
      if (current.isDefault && !merged.isActive)
        throw new ProductDomainError('PRODUCT_DEFAULT_VARIANT_REQUIRED');
      const prepared = await this.prepareVariant(
        tx,
        productId,
        merged,
        variantId,
      );
      if (prepared.data.isDefault)
        await tx.productVariant.updateMany({
          where: { productId, id: { not: variantId } },
          data: { isDefault: false },
        });
      return tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...prepared.data,
          combinationKey: prepared.combinationKey,
          optionValues: { deleteMany: {}, create: prepared.links },
        },
        select: productVariantSelect,
      });
    });
  }

  async setDefaultVariant(productId: string, variantId: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const target = await tx.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true, isActive: true },
      });
      if (!target) return null;
      if (!target.isActive)
        throw new ProductDomainError(
          'PRODUCT_DEFAULT_VARIANT_REQUIRED',
          'Không thể đặt biến thể đang tắt làm mặc định',
        );
      await tx.productVariant.updateMany({
        where: { productId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.productVariant.update({
        where: { id: variantId },
        data: { isDefault: true },
        select: productVariantSelect,
      });
    });
  }

  async removeVariant(productId: string, variantId: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: variantId, productId },
        select: {
          ...productVariantSelect,
          _count: {
            select: {
              stocks: true,
              receiptItems: true,
              cartItems: true,
              orderItems: true,
            },
          },
        },
      });
      if (!variant) return null;
      if (variant.isDefault)
        throw new ProductDomainError('PRODUCT_DEFAULT_VARIANT_REQUIRED');
      if (Object.values(variant._count).some((count) => count > 0))
        throw new ProductDomainError(
          'PRODUCT_VARIANT_DELETE_BLOCKED_BY_REFERENCES',
          undefined,
          variant._count,
        );
      await tx.productVariant.delete({ where: { id: variantId } });
      return variant;
    });
  }

  async generatePreview(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        options: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            code: true,
            values: {
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              select: { id: true, label: true, value: true },
            },
          },
        },
        variants: { select: { combinationKey: true } },
      },
    });
    if (!product) return null;
    if (product.options.length === 0)
      return {
        count: 1,
        limit: MAX_VARIANT_COMBINATIONS,
        combinations: [
          {
            label: 'Mặc định',
            combinationKey: 'DEFAULT',
            optionValueIds: [],
            exists: product.variants.some(
              (item) => item.combinationKey === 'DEFAULT',
            ),
          },
        ],
      };
    if (product.options.some((option) => option.values.length === 0))
      return { count: 0, limit: MAX_VARIANT_COMBINATIONS, combinations: [] };
    const count = product.options.reduce(
      (total, option) => total * option.values.length,
      1,
    );
    if (count > MAX_VARIANT_COMBINATIONS)
      throw new ProductDomainError(
        'PRODUCT_VARIANT_MATRIX_TOO_LARGE',
        undefined,
        { count, limit: MAX_VARIANT_COMBINATIONS },
      );
    const existing = new Set(
      product.variants.map((variant) => variant.combinationKey),
    );
    let combinations: Array<{
      labelParts: string[];
      keys: string[];
      optionValueIds: string[];
    }> = [{ labelParts: [], keys: [], optionValueIds: [] }];
    for (const option of product.options) {
      combinations = combinations.flatMap((current) =>
        option.values.map((value) => ({
          labelParts: [...current.labelParts, `${option.name}: ${value.label}`],
          keys: [...current.keys, `${option.code}=${value.value}`],
          optionValueIds: [...current.optionValueIds, value.id],
        })),
      );
    }
    return {
      count,
      limit: MAX_VARIANT_COMBINATIONS,
      combinations: combinations.map((item) => {
        const combinationKey = [...item.keys].sort().join('|');
        return {
          label: item.labelParts.join(' · '),
          combinationKey,
          optionValueIds: item.optionValueIds,
          exists: existing.has(combinationKey),
        };
      }),
    };
  }

  private async prepareProductInput(
    tx: Prisma.TransactionClient,
    dto: UpdateProductDto,
    current?: ProductDetailRecord,
  ) {
    const name = normalizeName(dto.name ?? current?.name ?? '');
    const supplierId =
      dto.supplierId === undefined
        ? (current?.supplier?.id ?? null)
        : dto.supplierId;
    const publisherId =
      dto.publisherId === undefined
        ? (current?.publisher?.id ?? null)
        : dto.publisherId;
    const releaseDate =
      dto.releaseDate === undefined
        ? (current?.releaseDate ?? null)
        : dto.releaseDate
          ? new Date(dto.releaseDate)
          : null;
    const categoryIds =
      dto.categoryIds ??
      current?.categories.map((item) => item.category.id) ??
      [];
    const authorIds =
      dto.authorIds ?? current?.authors.map((item) => item.author.id) ?? [];
    const attributeValues =
      dto.attributeValues === undefined
        ? []
        : await this.prepareAttributeValues(tx, dto.attributeValues);
    await this.assertRelations(tx, {
      supplierId,
      publisherId,
      categoryIds,
      authorIds,
    });
    return {
      name,
      description:
        dto.description === undefined
          ? current?.description
          : sanitizeProductDescription(dto.description),
      shortDescription:
        dto.shortDescription === undefined
          ? current?.shortDescription
          : dto.shortDescription,
      supplierId,
      publisherId,
      releaseDate,
      categoryIds,
      authorIds,
      attributeValues,
    };
  }

  private async prepareAttributeValues(
    tx: Prisma.TransactionClient,
    inputs: ProductAttributeValueInputDto[],
  ) {
    const ids = inputs.map((item) => item.attributeId);
    if (new Set(ids).size !== ids.length)
      throw new ProductDomainError(
        'PRODUCT_ATTRIBUTE_VALUE_INVALID',
        'Thuộc tính không được trùng lặp',
      );
    const attributes = await tx.productAttribute.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true },
    });
    if (attributes.length !== ids.length)
      throw new ProductDomainError(
        'PRODUCT_ATTRIBUTE_VALUE_INVALID',
        'Có thuộc tính không tồn tại',
      );
    const byId = new Map(
      attributes.map((attribute) => [attribute.id, attribute.type]),
    );
    return inputs.map((input) => ({
      attributeId: input.attributeId,
      ...attributeStorage(byId.get(input.attributeId)!, input.value),
    }));
  }

  private async assertRelations(
    tx: Prisma.TransactionClient,
    input: {
      supplierId: string | null;
      publisherId: string | null;
      categoryIds: string[];
      authorIds: string[];
    },
  ) {
    const [suppliers, publishers, categories, authors] = await Promise.all([
      input.supplierId
        ? tx.supplier.count({ where: { id: input.supplierId } })
        : 1,
      input.publisherId
        ? tx.publisher.count({ where: { id: input.publisherId } })
        : 1,
      input.categoryIds.length
        ? tx.category.count({ where: { id: { in: input.categoryIds } } })
        : 0,
      input.authorIds.length
        ? tx.author.count({ where: { id: { in: input.authorIds } } })
        : 0,
    ]);
    if (suppliers !== 1)
      throw new ProductDomainError(
        'PRODUCT_CONFIGURATION_INVALID',
        'Nhà cung cấp không tồn tại',
      );
    if (publishers !== 1)
      throw new ProductDomainError(
        'PRODUCT_CONFIGURATION_INVALID',
        'Nhà xuất bản không tồn tại',
      );
    if (categories !== input.categoryIds.length)
      throw new ProductDomainError(
        'PRODUCT_CONFIGURATION_INVALID',
        'Có danh mục không tồn tại',
      );
    if (authors !== input.authorIds.length)
      throw new ProductDomainError(
        'PRODUCT_CONFIGURATION_INVALID',
        'Có tác giả không tồn tại',
      );
  }

  private async assertProductNameAvailable(
    tx: Prisma.TransactionClient,
    input: {
      name: string;
      supplierId: string | null;
      publisherId: string | null;
      releaseDate: Date | null;
    },
    excludeId?: string,
  ) {
    const existing = await tx.product.findFirst({
      where: {
        name: { equals: input.name, mode: 'insensitive' },
        supplierId: input.supplierId,
        publisherId: input.publisherId,
        releaseDate: input.releaseDate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new ProductDomainError('PRODUCT_NAME_ALREADY_EXISTS_IN_SCOPE');
  }

  private async availableSlug(
    tx: Prisma.TransactionClient,
    name: string,
    excludeId?: string,
  ) {
    const base = toSlug(name);
    if (!base)
      throw new ProductDomainError(
        'PRODUCT_CONFIGURATION_INVALID',
        'Tên sản phẩm không thể tạo đường dẫn hợp lệ',
      );
    const owner = await tx.product.findFirst({
      where: { slug: base, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return owner ? `${base}-${ulid().slice(-6).toLowerCase()}` : base;
  }

  private async assertProductExists(
    tx: Prisma.TransactionClient,
    productId: string,
  ) {
    if (
      !(await tx.product.findUnique({
        where: { id: productId },
        select: { id: true },
      }))
    )
      throw new ProductDomainError('PRODUCT_NOT_FOUND');
  }

  private async assertOptionExists(
    tx: Prisma.TransactionClient,
    productId: string,
    optionId: string,
  ) {
    if (
      !(await tx.productOption.findFirst({
        where: { id: optionId, productId },
        select: { id: true },
      }))
    )
      throw new ProductDomainError('PRODUCT_OPTION_NOT_FOUND');
  }

  private async prepareVariant(
    tx: Prisma.TransactionClient,
    productId: string,
    dto: CreateProductVariantDto,
    excludeId?: string,
  ): Promise<PreparedVariant> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        status: true,
        options: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { id: true, code: true },
        },
        variants: {
          where: excludeId ? { id: { not: excludeId } } : undefined,
          select: { id: true, combinationKey: true },
        },
      },
    });
    if (!product) throw new ProductDomainError('PRODUCT_NOT_FOUND');
    const price = this.assertPrice(dto);
    const values = dto.optionValueIds.length
      ? await tx.productOptionValue.findMany({
          where: { id: { in: dto.optionValueIds } },
          select: {
            id: true,
            value: true,
            option: { select: { id: true, code: true, productId: true } },
          },
        })
      : [];
    if (
      values.length !== dto.optionValueIds.length ||
      values.some((value) => value.option.productId !== productId)
    ) {
      throw new ProductDomainError(
        'PRODUCT_VARIANT_OPTION_VALUE_SCOPE_MISMATCH',
      );
    }
    let combinationKey: string;
    let links: Array<{ optionId: string; optionValueId: string }>;
    if (product.options.length === 0) {
      if (
        values.length > 0 ||
        product.variants.length > 0 ||
        dto.isDefault === false ||
        dto.isActive === false
      )
        throw new ProductDomainError('PRODUCT_SIMPLE_VARIANT_REQUIRED');
      combinationKey = 'DEFAULT';
      links = [];
    } else {
      const optionIds = values.map((value) => value.option.id);
      if (
        values.length !== product.options.length ||
        new Set(optionIds).size !== product.options.length ||
        product.options.some((option) => !optionIds.includes(option.id))
      ) {
        throw new ProductDomainError('PRODUCT_VARIANT_INCOMPLETE_OPTIONS');
      }
      combinationKey = values
        .map((value) => `${value.option.code}=${value.value}`)
        .sort()
        .join('|');
      links = values.map((value) => ({
        optionId: value.option.id,
        optionValueId: value.id,
      }));
    }
    return {
      combinationKey,
      links,
      data: {
        name: normalizeName(dto.name),
        sku: dto.sku.trim().toUpperCase(),
        barcode: dto.barcode ?? null,
        isbn: dto.isbn ?? null,
        publicationYear: dto.publicationYear ?? null,
        pageCount: dto.pageCount ?? null,
        weightGram: dto.weightGram ?? null,
        packageSize: dto.packageSize ?? null,
        originalPrice: price.originalPrice,
        salePrice: price.salePrice,
        saleStartAt: price.saleStartAt,
        saleEndAt: price.saleEndAt,
        isDefault:
          product.options.length === 0 ? true : (dto.isDefault ?? false),
        isActive: dto.isActive ?? true,
      },
    };
  }

  private assertPrice(
    input: Pick<
      CreateProductVariantDto,
      'originalPrice' | 'salePrice' | 'saleStartAt' | 'saleEndAt'
    >,
  ) {
    const originalPrice = new Prisma.Decimal(input.originalPrice);
    const salePrice =
      input.salePrice == null ? null : new Prisma.Decimal(input.salePrice);
    if (
      !originalPrice.isInteger() ||
      originalPrice.isNegative() ||
      (salePrice &&
        (!salePrice.isInteger() ||
          salePrice.isNegative() ||
          salePrice.greaterThan(originalPrice)))
    ) {
      throw new ProductDomainError('PRODUCT_PRICE_INVALID');
    }
    const saleStartAt = input.saleStartAt ? new Date(input.saleStartAt) : null;
    const saleEndAt = input.saleEndAt ? new Date(input.saleEndAt) : null;
    if (!salePrice && (saleStartAt || saleEndAt))
      throw new ProductDomainError(
        'PRODUCT_SALE_PERIOD_INVALID',
        'Không được nhập thời gian khi chưa có giá khuyến mãi',
      );
    if (salePrice && Boolean(saleStartAt) !== Boolean(saleEndAt))
      throw new ProductDomainError(
        'PRODUCT_SALE_PERIOD_INVALID',
        'Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc khuyến mãi',
      );
    if (saleStartAt && saleEndAt && saleStartAt >= saleEndAt)
      throw new ProductDomainError('PRODUCT_SALE_PERIOD_INVALID');
    return { originalPrice, salePrice, saleStartAt, saleEndAt };
  }

  private async persistVariant(
    tx: Prisma.TransactionClient,
    productId: string,
    prepared: PreparedVariant,
  ) {
    if (prepared.data.isDefault)
      await tx.productVariant.updateMany({
        where: { productId, isDefault: true },
        data: { isDefault: false },
      });
    return tx.productVariant.create({
      data: {
        productId,
        ...prepared.data,
        combinationKey: prepared.combinationKey,
        optionValues: { create: prepared.links },
      },
      select: productVariantSelect,
    });
  }
}

function normalizeName(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function attributeStorage(
  type: ProductAttributeType,
  value: unknown,
): Omit<
  Prisma.ProductAttributeValueUncheckedCreateWithoutProductInput,
  'attributeId'
> {
  const empty = {
    textValue: null,
    numberValue: null,
    booleanValue: null,
    dateValue: null,
    jsonValue: Prisma.JsonNull,
  };
  switch (type) {
    case ProductAttributeType.TEXT:
    case ProductAttributeType.SINGLE_SELECT:
      if (typeof value !== 'string' || !value.trim())
        throw new ProductDomainError('PRODUCT_ATTRIBUTE_VALUE_INVALID');
      return { ...empty, textValue: value.trim() };
    case ProductAttributeType.NUMBER: {
      if (
        (typeof value !== 'string' && typeof value !== 'number') ||
        `${value}`.trim() === '' ||
        !Number.isFinite(Number(value))
      )
        throw new ProductDomainError('PRODUCT_ATTRIBUTE_VALUE_INVALID');
      return { ...empty, numberValue: new Prisma.Decimal(`${value}`) };
    }
    case ProductAttributeType.BOOLEAN:
      if (typeof value !== 'boolean')
        throw new ProductDomainError('PRODUCT_ATTRIBUTE_VALUE_INVALID');
      return { ...empty, booleanValue: value };
    case ProductAttributeType.DATE: {
      if (typeof value !== 'string')
        throw new ProductDomainError('PRODUCT_ATTRIBUTE_VALUE_INVALID');
      const dateValue = new Date(value);
      if (Number.isNaN(dateValue.getTime()))
        throw new ProductDomainError('PRODUCT_ATTRIBUTE_VALUE_INVALID');
      return { ...empty, dateValue };
    }
    case ProductAttributeType.MULTI_SELECT:
      if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== 'string') ||
        new Set(value).size !== value.length
      )
        throw new ProductDomainError('PRODUCT_ATTRIBUTE_VALUE_INVALID');
      return { ...empty, jsonValue: value as Prisma.InputJsonValue };
  }
}
