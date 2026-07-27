import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderHistoryEventType,
  OrderStatus,
  OrderStatusActorType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  cancelOrderInTransaction,
  cancellableOrderInclude,
} from '@/modules/orders/order-cancellation';
import {
  CustomerOrderListTab,
  type CustomerOrderListQueryDto,
} from './dto/customer-order.dto';

const orderInclude = {
  items: true,
  payment: { include: { transactions: { orderBy: { createdAt: 'desc' } } } },
} satisfies Prisma.OrderInclude;

const CUSTOMER_CANCELLABLE_STATUSES = new Set<OrderStatus>([
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAYMENT_FAILED,
  OrderStatus.PENDING,
]);

@Injectable()
export class CustomerOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: CustomerOrderListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const semanticTabFilter: Prisma.OrderWhereInput =
      query.tab === CustomerOrderListTab.SHIPPING
        ? {
            status: OrderStatus.SHIPPING,
            customerConfirmedReceivedAt: null,
          }
        : query.tab === CustomerOrderListTab.RECEIVED
          ? {
              OR: [
                {
                  status: OrderStatus.SHIPPING,
                  customerConfirmedReceivedAt: { not: null },
                },
                { status: OrderStatus.COMPLETED },
              ],
            }
          : {
              status: query.status?.length ? { in: query.status } : undefined,
            };
    const where: Prisma.OrderWhereInput = {
      userId: actor.id,
      ...semanticTabFilter,
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
          include: cancellableOrderInclude,
        });
        if (!order) this.notFound();
        await cancelOrderInTransaction(tx, order, {
          allowedStatuses: CUSTOMER_CANCELLABLE_STATUSES,
          actorType: OrderStatusActorType.CUSTOMER,
          actorUserId: actor.id,
          actorDisplayName: actor.fullName,
          actorRoleSnapshot: 'CUSTOMER',
          reason: reason?.trim() || 'Khách hàng yêu cầu hủy',
          invalidStatusCode: 'ORDER_CANNOT_BE_CANCELLED',
        });
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: orderInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return this.toResponse(result);
  }

  async confirmReceived(actor: AuthenticatedUser, orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId: actor.id },
        select: {
          id: true,
          status: true,
          branchId: true,
          customerConfirmedReceivedAt: true,
        },
      });
      if (!order) this.notFound();
      if (order.customerConfirmedReceivedAt) return;
      if (order.status !== OrderStatus.SHIPPING) {
        throw new ConflictException({
          code: 'ORDER_CONFIRM_RECEIVED_NOT_ALLOWED',
          message: 'Đơn hàng không còn ở trạng thái đang giao.',
        });
      }

      const confirmedAt = new Date();
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          userId: actor.id,
          status: OrderStatus.SHIPPING,
          customerConfirmedReceivedAt: null,
        },
        data: { customerConfirmedReceivedAt: confirmedAt },
      });
      if (claimed.count === 0) {
        const current = await tx.order.findFirst({
          where: { id: order.id, userId: actor.id },
          select: { customerConfirmedReceivedAt: true },
        });
        if (current?.customerConfirmedReceivedAt) return;
        throw new ConflictException({
          code: 'ORDER_CONCURRENT_UPDATE',
          message: 'Đơn hàng vừa được cập nhật. Vui lòng thử lại.',
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          eventType: OrderHistoryEventType.CUSTOMER_RECEIPT_CONFIRMED,
          fromStatus: null,
          toStatus: null,
          actorType: OrderStatusActorType.CUSTOMER,
          actorUserId: actor.id,
          actorDisplayNameSnapshot: actor.fullName,
          actorRoleSnapshot: 'CUSTOMER',
          branchId: order.branchId,
          note: 'Khách hàng xác nhận đã nhận đủ sản phẩm.',
          createdAt: confirmedAt,
        },
      });
    });
    return this.detail(actor, orderId);
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
      customerReceiptConfirmation: {
        confirmed: Boolean(order.customerConfirmedReceivedAt),
        confirmedAt: order.customerConfirmedReceivedAt?.toISOString() ?? null,
      },
      allowedActions: {
        cancel: CUSTOMER_CANCELLABLE_STATUSES.has(order.status),
        confirmReceived:
          order.status === OrderStatus.SHIPPING &&
          !order.customerConfirmedReceivedAt,
        retryPayment:
          order.status === OrderStatus.PAYMENT_FAILED &&
          order.payment?.method === PaymentMethod.VNPAY,
      },
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
