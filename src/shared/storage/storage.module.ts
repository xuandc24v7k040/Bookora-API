import { Module } from '@nestjs/common';
import { R2ObjectStorageService } from './r2-object-storage.service';

@Module({
  providers: [R2ObjectStorageService],
  exports: [R2ObjectStorageService],
})
export class StorageModule {}
