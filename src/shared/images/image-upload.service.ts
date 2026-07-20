import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { R2ObjectStorageService } from '../storage/r2-object-storage.service';
import { ImageProcessingService } from './image-processing.service';
import type { UploadImageInput } from './image.types';

@Injectable()
export class ImageUploadService {
  constructor(
    private readonly imageProcessing: ImageProcessingService,
    private readonly storage: R2ObjectStorageService,
  ) {}

  async upload(input: UploadImageInput) {
    const processed = await this.imageProcessing.process(
      input.file,
      input.preset,
    );
    const key = `${input.namespace}/${input.ownerId}/${ulid()}.webp`;
    return this.storage.upload({
      visibility: input.visibility,
      key,
      body: processed.body,
      contentType: processed.contentType,
      cacheControl:
        input.visibility === 'public'
          ? 'public, max-age=31536000, immutable'
          : undefined,
    });
  }
}
