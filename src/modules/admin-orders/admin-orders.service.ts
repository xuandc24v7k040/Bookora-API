import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderHistoryEventType,
  OrderStatus,
  OrderStatusActorType,
  PaymentMethod,
  PaymentStatus,
} from '@/generated/prisma/client';
import { PaginatedResponseDto } from '@/common/dto';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { BranchContext } from '@/modules/authorization';
import { cancelOrderInTransaction } from '@/modules/orders/order-cancellation';
import { recordOrderStatusHistory } from '@/modules/orders/order-status-history';
import {
  AdminOrdersRepository,
  type AdminOrderDetailRecord,
  type AdminOrderListRecord,
} from './admin-orders.repository';
import type {
  AdminOrderCancelDto,
  AdminOrderDetailDto,
  AdminOrderInternalNoteDto,
  AdminOrderListItemDto,
  AdminOrderListQueryDto,
  AdminOrderTransitionDto,
} from './dto';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.PENDING]: OrderStatus.CONFIRMED,
  [OrderStatus.CONFIRMED]: OrderStatus.PACKING,
  [OrderStatus.PACKING]: OrderStatus.SHIPPING,
  [OrderStatus.SHIPPING]: OrderStatus.COMPLETED,
};

const ADMIN_CANCELLABLE_STATUSES = new Set<OrderStatus>([
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAYMENT_FAILED,
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PACKING,
]);

@Injectable()
export class AdminOrdersService {
  constructor(private readonly repository: AdminOrdersRepository) {}

  async list(
    context: BranchContext,
    query: AdminOrderListQueryDto,
  ): Promise<PaginatedResponseDto<AdminOrderListItemDto>> {
    const branchId = this.selectedBranchId(context);
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      throw new BadRequestException({
        code: 'ADMIN_ORDER_DATE_RANGE_INVALID',
        message: 'Ngày bắt đầu không được sau ngày kết thúc.',
      });
    }
    const result = await this.repository.list(branchId, query);
    return new PaginatedResponseDto(
      result.items.map((order) => this.toListItem(order)),
      result.total,
      result.page,
      result.limit,
    );
  }

  async detail(
    actor: AuthenticatedUser,
    context: BranchContext,
    orderId: string,
  ): Promise<AdminOrderDetailDto> {
    const branchId = this.selectedBranchId(context);
    const order = await this.repository.detail(branchId, orderId);
    if (!order) this.notFound();
    return this.toDetail(order, actor);
  }

  async transition(
    actor: AuthenticatedUser,
    context: BranchContext,
    orderId: string,
    dto: AdminOrderTransitionDto,
  ): Promise<AdminOrderDetailDto> {
    this.assertMutation(actor, 'orders.update_status');
    const branchId = this.selectedBranchId(context);
    await this.repository.transaction(async (tx) => {
      const order = await this.repository.findCancellable(
        tx,
        branchId,
        orderId,
      );
      if (!order) this.notFound();
      const expectedTarget = NEXT_STATUS[order.status];
      if (!expectedTarget || expectedTarget !== dto.targetStatus) {
        throw new ConflictException({
          code: 'ORDER_TRANSITION_INVALID',
          message: 'Không thể chuyển đơn hàng sang trạng thái đã chọn.',
        });
      }
      if (
        dto.targetStatus === OrderStatus.COMPLETED &&
        !order.customerConfirmedReceivedAt
      ) {
        throw new ConflictException({
          code: 'ORDER_CUSTOMER_RECEIPT_REQUIRED',
          message: 'Đang chờ khách hàng xác nhận đã nhận hàng.',
        });
      }
      const transitioned = await this.repository.transition(
        tx,
        order.id,
        order.status,
        dto.targetStatus,
      );
      if (!transitioned) this.concurrentUpdate();

      const now = new Date();
      if (
        dto.targetStatus === OrderStatus.COMPLETED &&
        order.payment?.method === PaymentMethod.COD &&
        order.payment.status === PaymentStatus.UNPAID
      ) {
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status: PaymentStatus.PAID, paidAt: now },
        });
      }
      await recordOrderStatusHistory(tx, {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: dto.targetStatus,
        actorType: OrderStatusActorType.ADMIN,
        actorUserId: actor.id,
        actorDisplayNameSnapshot: actor.fullName,
        actorRoleSnapshot: this.actorRoleSnapshot(actor),
        branchId,
        note: dto.note?.trim() || null,
        createdAt: now,
      });
    });
    return this.detail(actor, context, orderId);
  }

  async cancel(
    actor: AuthenticatedUser,
    context: BranchContext,
    orderId: string,
    dto: AdminOrderCancelDto,
  ): Promise<AdminOrderDetailDto> {
    this.assertMutation(actor, 'orders.cancel');
    const branchId = this.selectedBranchId(context);
    const reason = dto.reason.trim();
    await this.repository.transaction(async (tx) => {
      const order = await this.repository.findCancellable(
        tx,
        branchId,
        orderId,
      );
      if (!order) this.notFound();
      await cancelOrderInTransaction(tx, order, {
        allowedStatuses: ADMIN_CANCELLABLE_STATUSES,
        actorType: OrderStatusActorType.ADMIN,
        actorUserId: actor.id,
        actorDisplayName: actor.fullName,
        actorRoleSnapshot: this.actorRoleSnapshot(actor),
        reason,
        invalidStatusCode: 'ORDER_CANCEL_NOT_ALLOWED',
      });
    });
    return this.detail(actor, context, orderId);
  }

  async updateInternalNote(
    actor: AuthenticatedUser,
    context: BranchContext,
    orderId: string,
    dto: AdminOrderInternalNoteDto,
  ): Promise<AdminOrderDetailDto> {
    this.assertMutation(actor, 'orders.update_note');
    const branchId = this.selectedBranchId(context);
    const order = await this.repository.detail(branchId, orderId);
    if (!order) this.notFound();
    await this.repository.transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          internalNote: dto.note.trim() || null,
          internalNoteUpdatedById: actor.id,
          internalNoteUpdatedAt: new Date(),
        },
      });
    });
    return this.detail(actor, context, orderId);
  }

  private toListItem(order: AdminOrderListRecord): AdminOrderListItemDto {
    return {
      id: order.id,
      orderCode: order.orderCode,
      customerDisplay:
        order.user.fullName || order.receiverName || order.user.email,
      receiverPhone: order.receiverPhone,
      branchId: order.branchId,
      branchName: order.branchNameSnapshot,
      itemLineCount: order.items.length,
      totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      status: order.status,
      paymentMethod: order.payment?.method ?? PaymentMethod.COD,
      paymentStatus: order.payment?.status ?? PaymentStatus.UNPAID,
      customerReceiptConfirmed: Boolean(order.customerConfirmedReceivedAt),
      totalAmount: Number(order.totalAmount),
      placedAt: order.placedAt.toISOString(),
    };
  }

  private toDetail(
    order: AdminOrderDetailRecord,
    actor: AuthenticatedUser,
  ): AdminOrderDetailDto {
    const receiptEvent = order.statusHistories.find(
      (entry) =>
        entry.eventType === OrderHistoryEventType.CUSTOMER_RECEIPT_CONFIRMED,
    );
    const allowedActions = this.allowedActions(order, actor);
    const waitingForCustomerReceipt =
      !actor.isSuperAdmin &&
      actor.permissions.includes('orders.update_status') &&
      order.status === OrderStatus.SHIPPING &&
      !order.customerConfirmedReceivedAt;
    return {
      id: order.id,
      orderCode: order.orderCode,
      status: order.status,
      placedAt: order.placedAt.toISOString(),
      branchId: order.branchId,
      branchName: order.branchNameSnapshot,
      branchAddress: order.branchAddressSnapshot,
      customerId: order.user.id,
      customerName: order.user.fullName || order.receiverName,
      customerEmail: order.user.email,
      customerPhone: order.user.phone,
      receiverName: order.receiverName,
      receiverPhone: order.receiverPhone,
      shippingAddress: order.shippingAddress,
      shippingServiceName: order.shippingServiceName,
      shippingProvider: order.shippingProviderSnapshot,
      estimatedDeliveryAt: order.estimatedDeliveryAt?.toISOString() ?? null,
      subtotalAmount: Number(order.subtotalAmount),
      discountAmount: Number(order.discountAmount),
      shippingFee: Number(order.shippingFee),
      totalAmount: Number(order.totalAmount),
      customerNote: order.note,
      internalNote: order.internalNote,
      internalNoteUpdatedAt: order.internalNoteUpdatedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancelReason: order.cancelReason,
      itemLineCount: order.items.length,
      totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        productSlug: item.productSlug,
        variantLabel: item.variantLabel,
        variantOptions:
          typeof item.variantOptions === 'object' &&
          item.variantOptions !== null
            ? item.variantOptions
            : { value: item.variantOptions },
        imageUrl: item.imageUrl,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        originalPrice: Number(item.originalPrice),
        discountAmount: Number(item.discountAmount),
        lineTotal: Number(item.lineTotal),
      })),
      payment: order.payment
        ? {
            id: order.payment.id,
            method: order.payment.method,
            status: order.payment.status,
            amount: Number(order.payment.amount),
            currency: order.payment.currency,
            paidAt: order.payment.paidAt?.toISOString() ?? null,
            createdAt: order.payment.createdAt.toISOString(),
            transactions: order.payment.transactions.map((transaction) => ({
              id: transaction.id,
              provider: transaction.provider,
              status: transaction.status,
              amount: Number(transaction.amount),
              providerTransactionNo: transaction.providerTransactionNo,
              bankCode: transaction.bankCode,
              cardType: transaction.cardType,
              responseCode: transaction.responseCode,
              transactionStatus: transaction.transactionStatus,
              expiresAt: transaction.expiresAt?.toISOString() ?? null,
              payDate: transaction.payDate?.toISOString() ?? null,
              callbackReceivedAt:
                transaction.callbackReceivedAt?.toISOString() ?? null,
              createdAt: transaction.createdAt.toISOString(),
            })),
          }
        : null,
      history: order.statusHistories.map((entry) => ({
        id: entry.id,
        eventType: entry.eventType,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        actorType: entry.actorType,
        actorUserId: entry.actorUserId,
        actorDisplayName: entry.actorDisplayNameSnapshot,
        actorRole: entry.actorRoleSnapshot,
        branchId: entry.branchId,
        branchName: entry.branch.name,
        reason: entry.reason,
        note: entry.note,
        createdAt: entry.createdAt.toISOString(),
      })),
      customerReceiptConfirmation: {
        confirmed: Boolean(order.customerConfirmedReceivedAt),
        confirmedAt: order.customerConfirmedReceivedAt?.toISOString() ?? null,
        confirmedByName: receiptEvent?.actorDisplayNameSnapshot ?? null,
      },
      completionReadiness: {
        ready: allowedActions.complete,
        reasonCode: waitingForCustomerReceipt
          ? 'WAITING_CUSTOMER_RECEIPT'
          : null,
      },
      allowedActions,
    };
  }

  private allowedActions(
    order: AdminOrderDetailRecord,
    actor: AuthenticatedUser,
  ) {
    const mutable = !actor.isSuperAdmin;
    const canUpdateStatus =
      mutable && actor.permissions.includes('orders.update_status');
    const canCancel =
      mutable &&
      actor.permissions.includes('orders.cancel') &&
      ADMIN_CANCELLABLE_STATUSES.has(order.status) &&
      !(
        order.payment?.method === PaymentMethod.VNPAY &&
        order.payment.status === PaymentStatus.PAID
      );
    return {
      confirm: canUpdateStatus && order.status === OrderStatus.PENDING,
      startPacking: canUpdateStatus && order.status === OrderStatus.CONFIRMED,
      startShipping: canUpdateStatus && order.status === OrderStatus.PACKING,
      complete:
        canUpdateStatus &&
        order.status === OrderStatus.SHIPPING &&
        Boolean(order.customerConfirmedReceivedAt),
      cancel: canCancel,
      updateInternalNote:
        mutable && actor.permissions.includes('orders.update_note'),
    };
  }

  private selectedBranchId(context: BranchContext): string {
    if (context.scope === 'SELECTED') return context.selectedBranchId;
    throw new BadRequestException({
      code: 'BRANCH_SELECTION_REQUIRED',
      message: 'Vui lòng chọn chi nhánh.',
    });
  }

  private assertMutation(actor: AuthenticatedUser, permission: string): void {
    if (!actor.isSuperAdmin && actor.permissions.includes(permission)) return;
    throw new ForbiddenException({
      code: 'ADMIN_ORDER_MUTATION_FORBIDDEN',
      message: 'Bạn không có quyền thực hiện thao tác này.',
    });
  }

  private actorRoleSnapshot(actor: AuthenticatedUser): string | null {
    const codes = actor.roles.map(({ code }) => code);
    return codes.length ? codes.join(', ') : null;
  }

  private concurrentUpdate(): never {
    throw new ConflictException({
      code: 'ORDER_CONCURRENT_UPDATE',
      message: 'Đơn hàng đã được xử lý bởi người khác. Vui lòng tải lại.',
    });
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'ADMIN_ORDER_NOT_FOUND',
      message: 'Không tìm thấy đơn hàng trong chi nhánh hiện tại.',
    });
  }
}
