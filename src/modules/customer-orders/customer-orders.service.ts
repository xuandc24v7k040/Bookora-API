import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { CustomerOrderListQueryDto } from './dto/customer-order.dto';

const orderInclude = {
  items: true,
  payment: { include: { transactions: { orderBy: { createdAt: 'desc' } } } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class CustomerOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: CustomerOrderListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const where: Prisma.OrderWhereInput = {
      userId: actor.id,
      status: query.status?.length ? { in: query.status } : undefined,
    };
    const [orders, totalItems] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: orders.map((order) => this.toResponse(order)),
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    };
  }

  async detail(actor: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId: actor.id },
      include: orderInclude,
    });
    if (!order) this.notFound();
    return this.toResponse(order);
  }

  async cancel(actor: AuthenticatedUser, orderId: string, reason?: string) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, userId: actor.id },
          include: orderInclude,
        });
        if (!order) this.notFound();
        if (order.status === OrderStatus.CANCELLED) return order;
        const cancellableStatuses = new Set<OrderStatus>([
          OrderStatus.PENDING_PAYMENT,
          OrderStatus.PAYMENT_FAILED,
          OrderStatus.PENDING,
        ]);
        if (!cancellableStatuses.has(order.status)) {
          throw new ConflictException({
            code: 'ORDER_CANNOT_BE_CANCELLED',
            message: 'Đơn hàng đã được xử lý và không thể hủy.',
          });
        }
        if (
          order.payment?.method === PaymentMethod.VNPAY &&
          order.payment.status === PaymentStatus.PAID
        ) {
          throw new ConflictException({
            code: 'ORDER_CANCELLATION_REQUIRES_REFUND',
            message:
              'Đơn đã thanh toán cần được xử lý hoàn tiền trước khi hủy.',
          });
        }
        const now = new Date();
        const activeHold = order.payment?.transactions.find(
          (transaction) =>
            transaction.stockReservedAt !== null &&
            transaction.stockReleasedAt === null &&
            transaction.stockConsumedAt === null,
        );
        if (activeHold) {
          const claimed = await tx.paymentTransaction.updateMany({
            where: {
              id: activeHold.id,
              stockReservedAt: { not: null },
              stockReleasedAt: null,
              stockConsumedAt: null,
            },
            data: { stockReleasedAt: now },
          });
          if (claimed.count === 1) {
            for (const item of order.items) {
              if (!item.variantId) continue;
              await this.restoreStock(
                tx,
                order.branchId,
                item.variantId,
                item.quantity,
              );
            }
          }
        }
        if (
          order.payment?.method === PaymentMethod.COD &&
          order.stockDeductedAt &&
          !order.stockRestoredAt
        ) {
          for (const item of order.items) {
            if (!item.variantId) continue;
            await this.restoreStock(
              tx,
              order.branchId,
              item.variantId,
              item.quantity,
            );
          }
        }
        if (
          order.payment?.status === PaymentStatus.PENDING ||
          order.payment?.status === PaymentStatus.UNPAID
        ) {
          await tx.payment.update({
            where: { id: order.payment.id },
            data: { status: PaymentStatus.CANCELLED },
          });
        }
        return tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: now,
            cancelReason: reason?.trim() || 'Khách hàng yêu cầu hủy',
            stockRestoredAt: now,
          },
          include: orderInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.toResponse(result);
  }

  private async restoreStock(
    tx: Prisma.TransactionClient,
    branchId: string,
    variantId: string,
    quantity: number,
  ): Promise<void> {
    await tx.branchProductStock.update({
      where: { branchId_variantId: { branchId, variantId } },
      data: { quantity: { increment: quantity } },
    });
  }

  private toResponse(
    order: Prisma.OrderGetPayload<{ include: typeof orderInclude }>,
  ) {
    return {
      id: order.id,
      orderCode: order.orderCode,
      status: order.status,
      subtotalAmount: Number(order.subtotalAmount),
      discountAmount: Number(order.discountAmount),
      shippingFee: Number(order.shippingFee),
      totalAmount: Number(order.totalAmount),
      receiverName: order.receiverName,
      receiverPhone: order.receiverPhone,
      shippingAddress: order.shippingAddress,
      branchName: order.branchNameSnapshot,
      branchId: order.branchId,
      shippingServiceName: order.shippingServiceName,
      note: order.note,
      placedAt: order.placedAt.toISOString(),
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancelReason: order.cancelReason,
      paymentMethod: order.payment?.method ?? PaymentMethod.COD,
      paymentStatus: order.payment?.status ?? PaymentStatus.UNPAID,
      paymentId: order.payment?.id ?? null,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        productSlug: item.productSlug,
        variantLabel: item.variantLabel,
        variantOptions: item.variantOptions,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      })),
    };
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'ORDER_NOT_FOUND',
      message: 'Không tìm thấy đơn hàng.',
    });
  }
}
