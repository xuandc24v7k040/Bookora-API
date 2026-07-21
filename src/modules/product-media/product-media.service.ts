import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { ImageUploadService } from '@/shared/images/image-upload.service';
import type {
  ReorderProductMediaDto,
  UpdateProductMediaDto,
  UploadProductMediaDto,
} from './dto';
import {
  PRODUCT_MEDIA_MESSAGES,
  ProductMediaDomainError,
} from './product-media.constants';
import { ProductMediaCleanupService } from './product-media-cleanup.service';
import {
  type ProductMediaRecord,
  ProductMediaRepository,
} from './product-media.repository';

const BAD_REQUEST_CODES = new Set([
  'PRODUCT_MEDIA_VARIANT_SCOPE_MISMATCH',
  'PRODUCT_MEDIA_GALLERY_LIMIT_EXCEEDED',
  'PRODUCT_MEDIA_REORDER_INVALID',
  'PRODUCT_OPTION_VALUE_IMAGE_SCOPE_MISMATCH',
]);

@Injectable()
export class ProductMediaService {
  constructor(
    private readonly repository: ProductMediaRepository,
    private readonly imageUpload: ImageUploadService,
    private readonly cleanup: ProductMediaCleanupService,
  ) {}

  async list(productId: string, variantId?: string) {
    const context = await this.repository.getUploadContext(
      productId,
      variantId ?? null,
    );
    if (!context) this.productNotFound();
    return (await this.repository.list(productId, variantId ?? null)).map(
      (media) => this.toResponse(media),
    );
  }

  async upload(
    productId: string,
    file: Express.Multer.File,
    dto: UploadProductMediaDto,
  ) {
    return this.execute(async () => {
      const variantId = dto.variantId ?? null;
      const context = await this.repository.getUploadContext(
        productId,
        variantId,
      );
      if (!context) this.productNotFound();
      const ownerId = variantId
        ? `${productId}/media/variants/${variantId}`
        : `${productId}/media/general`;
      const uploaded = await this.imageUpload.upload({
        file,
        namespace: 'products',
        ownerId,
        visibility: 'public',
        preset: 'productGallery',
      });
      try {
        const defaultAlt = context.variant
          ? `${context.product.name} ${context.variant.name}`
          : context.product.name;
        const media = await this.repository.create({
          productId,
          variantId,
          url: uploaded.url!,
          altText: dto.altText?.trim() || defaultAlt,
          isPrimary: dto.isPrimary ?? false,
        });
        return this.toResponse(media);
      } catch (error) {
        await this.cleanup.cleanupKey(uploaded.key, 'upload-compensation');
        throw error;
      }
    });
  }

  async updateAltText(
    productId: string,
    mediaId: string,
    dto: UpdateProductMediaDto,
  ) {
    return this.execute(async () => {
      const media = await this.repository.updateAltText(
        productId,
        mediaId,
        dto.altText?.trim() || null,
      );
      if (!media) this.mediaNotFound();
      return this.toResponse(media);
    });
  }

  async setPrimary(productId: string, mediaId: string) {
    return this.execute(async () => {
      const media = await this.repository.setPrimary(productId, mediaId);
      if (!media) this.mediaNotFound();
      return this.toResponse(media);
    });
  }

  async reorder(productId: string, dto: ReorderProductMediaDto) {
    return this.execute(async () =>
      (
        await this.repository.reorder(
          productId,
          dto.variantId ?? null,
          dto.orderedMediaIds,
        )
      ).map((media) => this.toResponse(media)),
    );
  }

  async remove(productId: string, mediaId: string) {
    return this.execute(async () => {
      const media = await this.repository.delete(productId, mediaId);
      if (!media) this.mediaNotFound();
      await this.cleanup.cleanupUrls([media.url], 'media-delete');
      return this.toResponse(media);
    });
  }

  async uploadOptionValueImage(
    productId: string,
    optionId: string,
    optionValueId: string,
    file: Express.Multer.File,
  ) {
    return this.execute(async () => {
      const current = await this.repository.getOptionValueContext(
        productId,
        optionId,
        optionValueId,
      );
      if (!current) {
        throw new ProductMediaDomainError(
          'PRODUCT_OPTION_VALUE_IMAGE_SCOPE_MISMATCH',
        );
      }
      const uploaded = await this.imageUpload.upload({
        file,
        namespace: 'products',
        ownerId: `${productId}/option-values/${optionValueId}`,
        visibility: 'public',
        preset: 'optionValueThumbnail',
      });
      try {
        const updated = await this.repository.updateOptionValueImage(
          optionValueId,
          uploaded.url,
        );
        await this.cleanup.cleanupUrls(
          current.imageUrl ? [current.imageUrl] : [],
          'option-value-replace-old',
        );
        return updated;
      } catch (error) {
        await this.cleanup.cleanupKey(
          uploaded.key,
          'option-value-replace-compensation',
        );
        throw error;
      }
    });
  }

  async removeOptionValueImage(
    productId: string,
    optionId: string,
    optionValueId: string,
  ) {
    return this.execute(async () => {
      const current = await this.repository.getOptionValueContext(
        productId,
        optionId,
        optionValueId,
      );
      if (!current) {
        throw new ProductMediaDomainError(
          'PRODUCT_OPTION_VALUE_IMAGE_SCOPE_MISMATCH',
        );
      }
      if (!current.imageUrl) {
        return { id: current.id, label: current.label, imageUrl: null };
      }
      const updated = await this.repository.updateOptionValueImage(
        optionValueId,
        null,
      );
      await this.cleanup.cleanupUrls([current.imageUrl], 'option-value-remove');
      return updated;
    });
  }

  private toResponse(media: ProductMediaRecord) {
    return {
      ...media,
      createdAt: media.createdAt.toISOString(),
      updatedAt: media.updatedAt.toISOString(),
    };
  }

  private async execute<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof ProductMediaDomainError) {
      const body = { code: error.code, message: error.message };
      if (error.code === 'PRODUCT_NOT_FOUND') {
        throw new NotFoundException(body);
      }
      if (error.code === 'PRODUCT_MEDIA_NOT_FOUND') {
        throw new NotFoundException(body);
      }
      if (BAD_REQUEST_CODES.has(error.code)) {
        throw new BadRequestException(body);
      }
      throw new ConflictException(body);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    ) {
      throw new ConflictException({
        code: 'PRODUCT_MEDIA_CONCURRENT_UPDATE',
        message: 'Bộ sưu tập vừa thay đổi, vui lòng tải lại và thử lại',
      });
    }
    throw error;
  }

  private productNotFound(): never {
    throw new NotFoundException({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Không tìm thấy sản phẩm',
    });
  }

  private mediaNotFound(): never {
    throw new NotFoundException({
      code: 'PRODUCT_MEDIA_NOT_FOUND',
      message: PRODUCT_MEDIA_MESSAGES.PRODUCT_MEDIA_NOT_FOUND,
    });
  }
}
