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
});
