import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ImageProcessingService } from './image-processing.service';
import { ImageUploadService } from './image-upload.service';

@Module({
  imports: [StorageModule],
  providers: [ImageProcessingService, ImageUploadService],
  exports: [ImageProcessingService, ImageUploadService],
})
export class ImagesModule {}
