import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductMediaType,
  ProductStatus,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import {
  PRODUCT_GENERAL_MEDIA_LIMIT,
  PRODUCT_VARIANT_MEDIA_LIMIT,
  ProductMediaDomainError,
} from './product-media.constants';

export const productMediaSelect = {
  id: true,
  productId: true,
  variantId: true,
  type: true,
  url: true,
  altText: true,
  sortOrder: true,
  isPrimary: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductMediaSelect;

export type ProductMediaRecord = Prisma.ProductMediaGetPayload<{
  select: typeof productMediaSelect;
}>;

@Injectable()
export class ProductMediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(productId: string, variantId: string | null) {
    return this.prisma.productMedia.findMany({
      where: this.galleryWhere(productId, variantId),
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: productMediaSelect,
    });
  }

  async getUploadContext(productId: string, variantId: string | null) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true },
    });
    if (!product) return null;
    if (!variantId) return { product, variant: null };
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true, name: true },
    });
    if (!variant) {
      throw new ProductMediaDomainError('PRODUCT_MEDIA_VARIANT_SCOPE_MISMATCH');
    }
    return { product, variant };
  }

  async create(input: {
    productId: string;
    variantId: string | null;
    url: string;
    altText: string | null;
    isPrimary: boolean;
  }) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await this.assertProductAndVariant(tx, input.productId, input.variantId);
      const where = this.galleryWhere(input.productId, input.variantId);
      const current = await tx.productMedia.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, sortOrder: true, isPrimary: true },
      });
      const limit = input.variantId
        ? PRODUCT_VARIANT_MEDIA_LIMIT
        : PRODUCT_GENERAL_MEDIA_LIMIT;
      if (current.length >= limit) {
        throw new ProductMediaDomainError(
          'PRODUCT_MEDIA_GALLERY_LIMIT_EXCEEDED',
          `Bộ sưu tập đã đạt giới hạn ${limit} ảnh`,
        );
      }
      const shouldBePrimary = current.length === 0 || input.isPrimary;
      if (shouldBePrimary && current.length > 0) {
        await tx.productMedia.updateMany({
          where: { ...where, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.productMedia.create({
        data: {
          productId: input.productId,
          variantId: input.variantId,
          type: ProductMediaType.IMAGE,
          url: input.url,
          altText: input.altText,
          sortOrder: current.length,
          isPrimary: shouldBePrimary,
        },
        select: productMediaSelect,
      });
    });
  }

  async updateAltText(
    productId: string,
    mediaId: string,
    altText: string | null,
  ) {
    const media = await this.prisma.productMedia.findFirst({
      where: { id: mediaId, productId },
      select: { id: true },
    });
    if (!media) return null;
    return this.prisma.productMedia.update({
      where: { id: mediaId },
      data: { altText },
      select: productMediaSelect,
    });
  }

  async setPrimary(productId: string, mediaId: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const media = await tx.productMedia.findFirst({
        where: { id: mediaId, productId },
        select: productMediaSelect,
      });
      if (!media) return null;
      if (media.isPrimary) return media;
      const where = this.galleryWhere(productId, media.variantId);
      await tx.productMedia.updateMany({
        where: { ...where, isPrimary: true },
        data: { isPrimary: false },
      });
      return tx.productMedia.update({
        where: { id: mediaId },
        data: { isPrimary: true },
        select: productMediaSelect,
      });
    });
  }

  async reorder(
    productId: string,
    variantId: string | null,
    orderedMediaIds: readonly string[],
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await this.assertProductAndVariant(tx, productId, variantId);
      const where = this.galleryWhere(productId, variantId);
      const current = await tx.productMedia.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      const currentIds = new Set(current.map((item) => item.id));
      if (
        current.length !== orderedMediaIds.length ||
        orderedMediaIds.some((id) => !currentIds.has(id))
      ) {
        throw new ProductMediaDomainError('PRODUCT_MEDIA_REORDER_INVALID');
      }
      await Promise.all(
        orderedMediaIds.map((id, sortOrder) =>
          tx.productMedia.update({ where: { id }, data: { sortOrder } }),
        ),
      );
      return tx.productMedia.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: productMediaSelect,
      });
    });
  }

  async delete(productId: string, mediaId: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const media = await tx.productMedia.findFirst({
        where: { id: mediaId, productId },
        select: productMediaSelect,
      });
      if (!media) return null;
      const where = this.galleryWhere(productId, media.variantId);
      const gallery = await tx.productMedia.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: { id: true, isPrimary: true },
      });
      if (media.variantId === null && gallery.length === 1) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { status: true },
        });
        if (product?.status === ProductStatus.ACTIVE) {
          throw new ProductMediaDomainError(
            'PRODUCT_MEDIA_DELETE_BLOCKED_ACTIVE',
          );
        }
      }
      await tx.productMedia.delete({ where: { id: mediaId } });
      const remaining = gallery.filter((item) => item.id !== mediaId);
      if (media.isPrimary && remaining.length > 0) {
        await tx.productMedia.update({
          where: { id: remaining[0].id },
          data: { isPrimary: true },
        });
      }
      await Promise.all(
        remaining.map((item, sortOrder) =>
          tx.productMedia.update({
            where: { id: item.id },
            data: { sortOrder },
          }),
        ),
      );
      return media;
    });
  }

  async getOptionValueContext(
    productId: string,
    optionId: string,
    optionValueId: string,
  ) {
    return this.prisma.productOptionValue.findFirst({
      where: {
        id: optionValueId,
        optionId,
        option: { productId },
      },
      select: {
        id: true,
        label: true,
        imageUrl: true,
        option: { select: { product: { select: { name: true } } } },
      },
    });
  }

  updateOptionValueImage(optionValueId: string, imageUrl: string | null) {
    return this.prisma.productOptionValue.update({
      where: { id: optionValueId },
      data: { imageUrl },
      select: { id: true, label: true, imageUrl: true },
    });
  }

  private galleryWhere(
    productId: string,
    variantId: string | null,
  ): Prisma.ProductMediaWhereInput {
    return { productId, variantId };
  }

  private async assertProductAndVariant(
    tx: Prisma.TransactionClient,
    productId: string,
    variantId: string | null,
  ): Promise<void> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new ProductMediaDomainError('PRODUCT_NOT_FOUND');
    }
    if (!variantId) return;
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, productId },
      select: { id: true },
    });
    if (!variant) {
      throw new ProductMediaDomainError('PRODUCT_MEDIA_VARIANT_SCOPE_MISMATCH');
    }
  }
}
