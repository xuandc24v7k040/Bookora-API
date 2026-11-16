import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { R2ObjectStorageService } from './r2-object-storage.service';

describe('Shared R2 best-effort image cleanup', () => {
  const service = new R2ObjectStorageService({
    getOrThrow: () => ({
      endpoint: 'https://r2.example.test',
      region: 'auto',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      publicBucket: 'public',
      privateBucket: 'private',
      publicBaseUrl: 'https://cdn.example.test',
    }),
  } as unknown as ConfigService);

  afterEach(() => jest.restoreAllMocks());

  it('only deletes server-selected keys within the exact owner prefix and deduplicates them', async () => {
    const remove = jest.spyOn(service, 'delete').mockResolvedValue();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await service.cleanupKeys(
      [
        'reviews/a/one.webp',
        'reviews/a/one.webp',
        'reviews/b/other.webp',
        'products/a/image.webp',
      ],
      'reviews/a/',
      'test-cleanup',
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith({
      visibility: 'public',
      key: 'reviews/a/one.webp',
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('logs cleanup failure without undoing a committed metadata removal', async () => {
    jest.spyOn(service, 'delete').mockRejectedValue(new Error('Unavailable'));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    await expect(
      service.cleanupKeys(['reviews/a/one.webp'], 'reviews/a/', 'image-delete'),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('operation=image-delete key=reviews/a/one.webp'),
    );
  });
});
