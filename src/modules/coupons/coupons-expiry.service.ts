import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import {
  cancellableOrderInclude,
  cancelOrderInTransaction,
} from '@/modules/orders/order-cancellation';

/** Expiry is an order deadline, independent of individual VNPAY attempts. */
@Injectable()
export class CouponsExpiryService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(CouponsExpiryService.name);
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.cleanup();
    }, 60_000);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  async cleanup(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const couponRows = await this.prisma.couponRedemption.findMany({
        where: { status: 'RESERVED', expiresAt: { lte: new Date() } },
        select: { orderId: true },
        distinct: ['orderId'],
        take: 100,
        orderBy: { expiresAt: 'asc' },
      });
      const flashRows = await this.prisma.flashSaleAllocation.findMany({
        where: { status: 'RESERVED', expiresAt: { lte: new Date() } },
        select: { orderId: true },
        distinct: ['orderId'],
        take: 100,
        orderBy: { expiresAt: 'asc' },
      });
      const rows = [
        ...new Map(
          [...couponRows, ...flashRows].map((row) => [row.orderId, row]),
        ).values(),
      ];
      for (const { orderId } of rows) {
        await runSerializableTransaction(this.prisma, async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: cancellableOrderInclude,
          });
          if (
            !order ||
            !['PENDING_PAYMENT', 'PAYMENT_FAILED'].includes(order.status) ||
            order.payment?.status === 'PAID'
          )
            return;
          await cancelOrderInTransaction(tx, order, {
            allowedStatuses: new Set(['PENDING_PAYMENT', 'PAYMENT_FAILED']),
            actorType: 'SYSTEM',
            actorUserId: null,
            actorDisplayName: 'Hệ thống',
            actorRoleSnapshot: 'SYSTEM',
            reason: 'Hết thời hạn giữ voucher và thanh toán đơn hàng',
            invalidStatusCode: 'ORDER_CONCURRENT_UPDATE',
          });
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        'Không thể giải phóng voucher hết hạn; sẽ thử lại sau một phút.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
