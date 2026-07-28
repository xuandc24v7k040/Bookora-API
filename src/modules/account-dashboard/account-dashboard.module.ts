import { Module } from '@nestjs/common';
import { ReviewsModule } from '@/modules/reviews/reviews.module';
import { WishlistsModule } from '@/modules/wishlists/wishlists.module';
import { AccountDashboardController } from './account-dashboard.controller';
import { AccountDashboardRepository } from './account-dashboard.repository';
import { AccountDashboardService } from './account-dashboard.service';

@Module({
  imports: [ReviewsModule, WishlistsModule],
  controllers: [AccountDashboardController],
  providers: [AccountDashboardRepository, AccountDashboardService],
})
export class AccountDashboardModule {}
