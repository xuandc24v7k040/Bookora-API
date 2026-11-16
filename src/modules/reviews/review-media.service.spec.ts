import { ReviewMediaService } from './review-media.service';
import type { ReviewMediaRepository } from './review-media.repository';
import type { ImageUploadService } from '@/shared/images/image-upload.service';
import type { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';

describe('Review media lifecycle', () => {
  const repository = {
    assertOwned: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
  };
  const images = { upload: jest.fn() };
  const storage = { cleanupKeys: jest.fn() };
  const actor = { id: 'customer', type: 'CUSTOMER' } as AuthenticatedUser;
  const service = new ReviewMediaService(
    repository as unknown as ReviewMediaRepository,
    images as unknown as ImageUploadService,
    storage as unknown as R2ObjectStorageService,
  );
  const file = {} as Express.Multer.File;

  beforeEach(() => {
    jest.resetAllMocks();
    repository.assertOwned.mockResolvedValue(0);
    storage.cleanupKeys.mockResolvedValue(undefined);
  });

  it('rejects foreign ownership before processing or storage', async () => {
    repository.assertOwned.mockRejectedValue(new Error('scoped 404'));
    await expect(service.upload(actor, 'foreign', [file])).rejects.toThrow(
      'scoped 404',
    );
    expect(images.upload).not.toHaveBeenCalled();
  });

  it('compensates every uploaded object when metadata/quota fails', async () => {
    images.upload
      .mockResolvedValueOnce({
        key: 'reviews/review/a.webp',
        url: 'https://cdn/a',
      })
      .mockResolvedValueOnce({
        key: 'reviews/review/b.webp',
        url: 'https://cdn/b',
      });
    repository.add.mockRejectedValue(new Error('database unavailable'));
    await expect(service.upload(actor, 'review', [file, file])).rejects.toThrow(
      'database unavailable',
    );
    expect(storage.cleanupKeys).toHaveBeenCalledWith(
      ['reviews/review/a.webp', 'reviews/review/b.webp'],
      'reviews/review/',
      'upload-compensation',
    );
  });

  it('compensates the first object if processing/upload of the second fails', async () => {
    images.upload
      .mockResolvedValueOnce({
        key: 'reviews/review/a.webp',
        url: 'https://cdn/a',
      })
      .mockRejectedValueOnce(new Error('R2 unavailable'));
    await expect(service.upload(actor, 'review', [file, file])).rejects.toThrow(
      'R2 unavailable',
    );
    expect(repository.add).not.toHaveBeenCalled();
    expect(storage.cleanupKeys).toHaveBeenCalledWith(
      ['reviews/review/a.webp'],
      'reviews/review/',
      'upload-compensation',
    );
  });

  it('unlinks before cleanup and never accepts a client-supplied object key', async () => {
    repository.remove.mockResolvedValue('reviews/review/server-owned.webp');
    await expect(service.remove(actor, 'review', 'media')).resolves.toEqual({
      id: 'media',
    });
    expect(repository.remove).toHaveBeenCalledWith(actor.id, 'review', 'media');
    expect(storage.cleanupKeys).toHaveBeenCalledWith(
      ['reviews/review/server-owned.webp'],
      'reviews/review/',
      'image-delete',
    );
    expect(repository.remove.mock.invocationCallOrder[0]).toBeLessThan(
      storage.cleanupKeys.mock.invocationCallOrder[0],
    );
  });

  it.each([0, 5])(
    'rejects %s incoming files without storage writes',
    async (count) => {
      await expect(
        service.upload(
          actor,
          'review',
          Array.from({ length: count }, () => file),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(images.upload).not.toHaveBeenCalled();
    },
  );
});
