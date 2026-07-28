import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class AccountDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string) {
    const [totalOrders, spent, shippingOrderCount, latestOrder] =
      await Promise.all([
        this.prisma.order.count({ where: { userId } }),
        this.prisma.order.aggregate({
          where: { userId, status: OrderStatus.COMPLETED },
          _sum: { totalAmount: true },
        }),
        this.prisma.order.count({
          where: {
            userId,
            status: OrderStatus.SHIPPING,
            customerConfirmedReceivedAt: null,
          },
        }),
        this.prisma.order.findFirst({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            orderCode: true,
            status: true,
            customerConfirmedReceivedAt: true,
            totalAmount: true,
            placedAt: true,
            items: {
              orderBy: { id: 'asc' },
              select: {
                productName: true,
                imageUrl: true,
                quantity: true,
              },
            },
          },
        }),
      ]);
    return {
      totalOrders,
      totalSpent: Number(spent._sum.totalAmount ?? 0),
      shippingOrderCount,
      latestOrder,
    };
  }
}
