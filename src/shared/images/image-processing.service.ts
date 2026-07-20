import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { createImagePresets } from './image-presets';
import type { ImagePresetName } from './image.types';

const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

@Injectable()
export class ImageProcessingService {
  constructor(private readonly configService: ConfigService) {}

  async process(file: Express.Multer.File, presetName: ImagePresetName) {
    const imageConfig = this.configService.getOrThrow<{
      maxBytes: number;
      webpQuality: number;
    }>('storage.image');
    const preset = createImagePresets(imageConfig)[presetName];

    if (!SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      throw this.invalid(
        'CATEGORY_IMAGE_INVALID_TYPE',
        'Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP',
      );
    }
    if (
      file.size > preset.maxBytes ||
      file.buffer.byteLength > preset.maxBytes
    ) {
      throw this.invalid(
        'CATEGORY_IMAGE_TOO_LARGE',
        'Ảnh không được vượt quá 5 MB',
      );
    }

    try {
      const input = sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: preset.maxInputPixels,
      });
      const metadata = await input.metadata();
      if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
        throw this.invalid(
          'CATEGORY_IMAGE_INVALID_TYPE',
          'Nội dung tệp không phải ảnh JPEG, PNG hoặc WebP hợp lệ',
        );
      }
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width < preset.minWidth ||
        metadata.height < preset.minHeight ||
        metadata.width * metadata.height > preset.maxInputPixels
      ) {
        throw this.invalid(
          'CATEGORY_IMAGE_INVALID_DIMENSIONS',
          'Kích thước ảnh không hợp lệ',
        );
      }

      const output = await sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: preset.maxInputPixels,
      })
        .rotate()
        .resize({
          width: preset.maxOutputEdge,
          height: preset.maxOutputEdge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: preset.webpQuality })
        .toBuffer({ resolveWithObject: true });

      return {
        body: output.data,
        contentType: 'image/webp' as const,
        width: output.info.width,
        height: output.info.height,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw this.invalid(
        'CATEGORY_IMAGE_PROCESSING_FAILED',
        'Không thể xử lý tệp ảnh đã chọn',
      );
    }
  }

  private invalid(code: string, message: string): BadRequestException {
    return new BadRequestException({ code, message });
  }
}
