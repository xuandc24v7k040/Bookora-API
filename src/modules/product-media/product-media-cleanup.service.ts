import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';

@Injectable()
export class ProductMediaCleanupService {
  private readonly logger = new Logger(ProductMediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: R2ObjectStorageService,
  ) {}

  async collectProductUrls(productId: string): Promise<string[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        media: { select: { url: true } },
        options: {
          select: { values: { select: { imageUrl: true } } },
        },
      },
    });
    if (!product) return [];
    return [
      ...product.media.map((media) => media.url),
      ...product.options.flatMap((option) =>
        option.values.flatMap((value) =>
          value.imageUrl ? [value.imageUrl] : [],
        ),
      ),
    ];
  }

  async collectVariantUrls(variantId: string): Promise<string[]> {
    return (
      await this.prisma.productMedia.findMany({
        where: { variantId },
        select: { url: true },
      })
    ).map((media) => media.url);
  }

  async collectOptionUrls(optionId: string): Promise<string[]> {
    return (
      await this.prisma.productOptionValue.findMany({
        where: { optionId, imageUrl: { not: null } },
        select: { imageUrl: true },
      })
    ).flatMap((value) => (value.imageUrl ? [value.imageUrl] : []));
  }

  async collectOptionValueUrls(optionValueId: string): Promise<string[]> {
    const value = await this.prisma.productOptionValue.findUnique({
      where: { id: optionValueId },
      select: { imageUrl: true },
    });
    return value?.imageUrl ? [value.imageUrl] : [];
  }

  async cleanupUrls(urls: readonly string[], operation: string): Promise<void> {
    await Promise.all(
      [...new Set(urls)].map(async (url) => {
        const key = this.storage.extractPublicKey(url);
        if (!key || !key.startsWith('products/')) {
          this.logger.warn(
            `Skip product image cleanup operation=${operation} reason=untrusted-url`,
          );
          return;
        }
        await this.cleanupKey(key, operation);
      }),
    );
  }

  async cleanupKey(key: string, operation: string): Promise<void> {
    if (!key.startsWith('products/')) {
      this.logger.warn(
        `Skip product image cleanup operation=${operation} reason=untrusted-key`,
      );
      return;
    }
    try {
      await this.storage.delete({ visibility: 'public', key });
    } catch (error) {
      this.logger.error(
        `Product image cleanup failed operation=${operation} key=${key} error=${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }
}
