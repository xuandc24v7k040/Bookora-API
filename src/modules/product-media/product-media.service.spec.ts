/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductMediaType } from '@/generated/prisma/client';
import { ImageUploadService } from '@/shared/images/image-upload.service';
import { ProductMediaCleanupService } from './product-media-cleanup.service';
import { ProductMediaRepository } from './product-media.repository';
import { ProductMediaService } from './product-media.service';

describe('ProductMediaService', () => {
  const repository = {
    getUploadContext: jest.fn(),
    create: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
    getOptionValueContext: jest.fn(),
    updateOptionValueImage: jest.fn(),
  } as unknown as ProductMediaRepository;
  const imageUpload = { upload: jest.fn() } as unknown as ImageUploadService;
  const cleanup = {
    cleanupKey: jest.fn(),
    cleanupUrls: jest.fn(),
  } as unknown as ProductMediaCleanupService;
  const service = new ProductMediaService(repository, imageUpload, cleanup);
  const file = {
    buffer: Buffer.from('image'),
    mimetype: 'image/webp',
    size: 5,
    originalname: 'book.webp',
  } as Express.Multer.File;
  const media = {
    id: '01K00000000000000000000000',
    productId: '01K00000000000000000000001',
    variantId: null,
    type: ProductMediaType.IMAGE,
    url: 'https://cdn.test/products/p/media/general/m.webp',
    altText: 'Sách',
    sortOrder: 0,
    isPrimary: true,
    createdAt: new Date('2026-07-21T00:00:00Z'),
    updatedAt: new Date('2026-07-21T00:00:00Z'),
  };

  beforeEach(() => jest.clearAllMocks());

  it('uses the product gallery preset and default alt text', async () => {
    jest.mocked(repository.getUploadContext).mockResolvedValue({
      product: { id: media.productId, name: 'ReLIFE - Tập 12' },
      variant: null,
    });
    jest.mocked(imageUpload.upload).mockResolvedValue({
      bucket: 'bookora-public',
      key: `products/${media.productId}/media/general/new.webp`,
      url: media.url,
      contentType: 'image/webp',
      size: 5,
    });
    jest.mocked(repository.create).mockResolvedValue({
      ...media,
      altText: 'ReLIFE - Tập 12',
    });

    await service.upload(media.productId, file, {});

    expect(imageUpload.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: `${media.productId}/media/general`,
        preset: 'productGallery',
        visibility: 'public',
      }),
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ altText: 'ReLIFE - Tập 12' }),
    );
  });

  it('cleans the newly uploaded object when the database write fails', async () => {
    jest.mocked(repository.getUploadContext).mockResolvedValue({
      product: { id: media.productId, name: 'Sách' },
      variant: null,
    });
    jest.mocked(imageUpload.upload).mockResolvedValue({
      bucket: 'bookora-public',
      key: 'products/p/media/general/new.webp',
      url: media.url,
      contentType: 'image/webp',
      size: 5,
    });
    jest.mocked(repository.create).mockRejectedValue(new Error('database'));

    await expect(service.upload(media.productId, file, {})).rejects.toThrow(
      'database',
    );
    expect(cleanup.cleanupKey).toHaveBeenCalledWith(
      'products/p/media/general/new.webp',
      'upload-compensation',
    );
  });

  it('returns PRODUCT_NOT_FOUND when the aggregate does not exist', async () => {
    jest.mocked(repository.getUploadContext).mockResolvedValue(null);
    await expect(
      service.upload(media.productId, file, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(imageUpload.upload).not.toHaveBeenCalled();
  });

  it('maps a foreign option value to a stable bad request', async () => {
    jest.mocked(repository.getOptionValueContext).mockResolvedValue(null);
    await expect(
      service.uploadOptionValueImage(
        media.productId,
        '01K00000000000000000000002',
        '01K00000000000000000000003',
        file,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(imageUpload.upload).not.toHaveBeenCalled();
  });

  it('deletes the database row before best-effort object cleanup', async () => {
    jest.mocked(repository.delete).mockResolvedValue(media);
    await service.remove(media.productId, media.id);
    expect(repository.delete).toHaveBeenCalledWith(media.productId, media.id);
    expect(cleanup.cleanupUrls).toHaveBeenCalledWith(
      [media.url],
      'media-delete',
    );
  });
});
