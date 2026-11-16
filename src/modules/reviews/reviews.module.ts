import { Module } from '@nestjs/common';
import { AuthorizationModule } from '@/modules/authorization';
import {
  AdminReviewsController,
  CustomerReviewsController,
  PublicReviewsController,
} from './reviews.controller';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';
import { ImagesModule } from '@/shared/images/images.module';
import { StorageModule } from '@/shared/storage/storage.module';
import { ReviewMediaRepository } from './review-media.repository';
import { ReviewMediaService } from './review-media.service';

@Module({
  imports: [AuthorizationModule, ImagesModule, StorageModule],
  controllers: [
    PublicReviewsController,
    CustomerReviewsController,
    AdminReviewsController,
  ],
  providers: [
    ReviewsRepository,
    ReviewsService,
    ReviewMediaRepository,
    ReviewMediaService,
  ],
  exports: [ReviewsRepository],
})
export class ReviewsModule {}
