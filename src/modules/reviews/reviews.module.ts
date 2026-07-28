import { Module } from '@nestjs/common';
import { AuthorizationModule } from '@/modules/authorization';
import {
  AdminReviewsController,
  CustomerReviewsController,
  PublicReviewsController,
} from './reviews.controller';
import { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [
    PublicReviewsController,
    CustomerReviewsController,
    AdminReviewsController,
  ],
  providers: [ReviewsRepository, ReviewsService],
  exports: [ReviewsRepository],
})
export class ReviewsModule {}
