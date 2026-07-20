import { Module } from '@nestjs/common';
import { AuthorizationModule } from '@/modules/authorization';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { ImagesModule } from '@/shared/images/images.module';
import { StorageModule } from '@/shared/storage/storage.module';
import { CategoriesController } from './categories.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';

@Module({
  imports: [AuthorizationModule, ImagesModule, StorageModule],
  controllers: [CategoriesController],
  providers: [
    CategoriesRepository,
    CategoriesService,
    JwtAccessGuard,
    CsrfGuard,
  ],
})
export class CategoriesModule {}
