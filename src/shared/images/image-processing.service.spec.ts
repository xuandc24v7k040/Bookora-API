import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { ImageProcessingService } from './image-processing.service';

function multerFile(
  buffer: Buffer,
  mimetype = 'image/png',
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'category.png',
    encoding: '7bit',
    mimetype,
    size: buffer.byteLength,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

describe('ImageProcessingService', () => {
  const config = {
    getOrThrow: jest.fn(() => ({ maxBytes: 5 * 1024 * 1024, webpQuality: 82 })),
  } as unknown as ConfigService;
  const service = new ImageProcessingService(config);

  it('auto-orients, bounds and converts a valid image to WebP', async () => {
    const input = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    const result = await service.process(multerFile(input), 'category');
    expect(result.contentType).toBe('image/webp');
    expect(result.width).toBeLessThanOrEqual(1600);
    expect(result.height).toBeLessThanOrEqual(1600);
    expect((await sharp(result.body).metadata()).format).toBe('webp');
  });

  it('rejects unsupported MIME types before decoding', async () => {
    await expect(
      service.process(multerFile(Buffer.from('x'), 'image/gif'), 'category'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a spoofed image payload', async () => {
    await expect(
      service.process(multerFile(Buffer.from('not-an-image')), 'category'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('center-crops an avatar to a 512 by 512 WebP', async () => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    const result = await service.process(multerFile(input), 'avatar');
    expect(result).toMatchObject({
      contentType: 'image/webp',
      width: 512,
      height: 512,
    });
  });

  it.each(['jpeg', 'png', 'webp'] as const)(
    'accepts a real %s review image and strips metadata',
    async (format) => {
      const buffer = await sharp({
        create: { width: 64, height: 80, channels: 3, background: '#336699' },
      })
        .toFormat(format)
        .withMetadata()
        .toBuffer();
      const output = await service.process(
        multerFile(buffer, `image/${format}`),
        'review',
      );
      const metadata = await sharp(output.body).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined();
      expect(output.width).toBe(64);
    },
  );

  it('rejects a review MIME spoof even when the bytes decode to another supported format', async () => {
    const buffer = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    await expect(
      service.process(multerFile(buffer, 'image/jpeg'), 'review'),
    ).rejects.toMatchObject({
      response: { code: 'REVIEW_IMAGE_INVALID_FILE' },
    });
  });

  it.each([
    'image/gif',
    'image/svg+xml',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ])('rejects invalid review bytes declared as %s', async (mimetype) => {
    await expect(
      service.process(multerFile(Buffer.from('invalid'), mimetype), 'review'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized and truncated review inputs', async () => {
    await expect(
      service.process(multerFile(Buffer.alloc(5 * 1024 * 1024 + 1)), 'review'),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_IMAGE_TOO_LARGE' } });
    const buffer = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    await expect(
      service.process(multerFile(buffer.subarray(0, 32)), 'review'),
    ).rejects.toMatchObject({
      response: { code: 'REVIEW_IMAGE_INVALID_FILE' },
    });
  });
});
