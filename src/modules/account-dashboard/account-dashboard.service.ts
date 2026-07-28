import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { ReviewsRepository } from '@/modules/reviews/reviews.repository';
import { WishlistsService } from '@/modules/wishlists/wishlists.service';
import { AccountDashboardRepository } from './account-dashboard.repository';

@Injectable()
export class AccountDashboardService {
  constructor(
    private readonly repository: AccountDashboardRepository,
    private readonly reviews: ReviewsRepository,
    private readonly wishlists: WishlistsService,
  ) {}

  async get(actor: AuthenticatedUser) {
    if (actor.type !== UserType.CUSTOMER) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DASHBOARD_FORBIDDEN',
        message: 'Chỉ khách hàng được xem tổng quan tài khoản.',
      });
    }
    const [
      summary,
      writtenReviewCount,
      pendingReviewCount,
      latestWishlistItems,
    ] = await Promise.all([
      this.repository.summary(actor.id),
      this.reviews.countWritten(actor.id),
      this.reviews.pendingCount(actor.id),
      this.wishlists.latest(actor, 4),
    ]);
    const latest = summary.latestOrder;
    return {
      totalOrders: summary.totalOrders,
      totalSpent: summary.totalSpent,
      writtenReviewCount,
      shippingOrderCount: summary.shippingOrderCount,
      pendingReviewCount,
      latestOrder: latest
        ? {
            id: latest.id,
            orderCode: latest.orderCode,
            status: latest.status,
            customerConfirmedReceived: Boolean(
              latest.customerConfirmedReceivedAt,
            ),
            totalAmount: Number(latest.totalAmount),
            placedAt: latest.placedAt.toISOString(),
            itemCount: latest.items.length,
            totalQuantity: latest.items.reduce(
              (total, item) => total + item.quantity,
              0,
            ),
            productName: latest.items[0]?.productName ?? 'Đơn hàng Bookora',
            productImageUrl: latest.items[0]?.imageUrl ?? null,
          }
        : null,
      latestWishlistItems,
    };
  }
}
