import { Module } from '@nestjs/common';
import { AuthorizationModule } from '@/modules/authorization';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { ImagesModule } from '@/shared/images/images.module';
import { StorageModule } from '@/shared/storage/storage.module';
import { ProductMediaCleanupService } from './product-media-cleanup.service';
import { ProductMediaController } from './product-media.controller';
import { ProductMediaRepository } from './product-media.repository';
import { ProductMediaService } from './product-media.service';

@Module({
  imports: [AuthorizationModule, ImagesModule, StorageModule],
  controllers: [ProductMediaController],
  providers: [
    ProductMediaRepository,
    ProductMediaService,
    ProductMediaCleanupService,
    JwtAccessGuard,
    CsrfGuard,
  ],
  exports: [ProductMediaCleanupService],
})
export class ProductMediaModule {}
