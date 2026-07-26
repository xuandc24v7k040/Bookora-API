import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ulid } from 'ulid';
import {
  InventoryMovementSourceType,
  InventoryMovementType,
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionStatus,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { recordInventoryMovement } from '@/modules/inventory/inventory-movement';
import {
  VnpayService,
  type VnpayReturnResult,
} from '@/modules/integrations/vnpay/vnpay.service';

interface VnpayIpnResult {
  RspCode: string;
  Message: string;
}

const transactionInclude = {
  payment: {
    include: {
      order: { include: { items: true } },
      transactions: {
        select: { id: true, status: true, createdAt: true },
      },
    },
  },
} satisfies Prisma.PaymentTransactionInclude;

type TransactionWithOrder = Prisma.PaymentTransactionGetPayload<{
  include: typeof transactionInclude;
}>;

type SuccessfulVnpayTransitionResult =
  | 'applied'
  | 'already-applied'
  | 'rejected';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vnpay: VnpayService,
    private readonly config: ConfigService,
  ) {}

  async handleVnpayIpn(
    query: Readonly<Record<string, unknown>>,
  ): Promise<VnpayIpnResult> {
    if (!this.vnpay.verify(query)) {
      return { RspCode: '97', Message: 'Invalid signature' };
    }
    const merchantTxnRef = this.text(query.vnp_TxnRef);
    const amount = Number(this.text(query.vnp_Amount));
    if (!merchantTxnRef) {
      return { RspCode: '01', Message: 'Order not found' };
    }
    const current = await this.prisma.paymentTransaction.findUnique({
      where: { merchantTxnRef },
      include: transactionInclude,
    });
    if (!current) return { RspCode: '01', Message: 'Order not found' };
    if (!this.hasValidVnpayAmount(amount, current)) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }
    if (!this.isVerifiedVnpayCallback(query, current)) {
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const responseCode = this.text(query.vnp_ResponseCode);
    const providerStatus = this.text(query.vnp_TransactionStatus);
    const succeeded = responseCode === '00' && providerStatus === '00';
    if (succeeded) {
      if (
        current.status !== PaymentTransactionStatus.PENDING &&
        current.status !== PaymentTransactionStatus.PAID
      ) {
        return { RspCode: '02', Message: 'Order already confirmed' };
      }
      try {
        const result = await this.applySuccessfulVnpayTransaction(
          merchantTxnRef,
          query,
        );
        return result === 'rejected'
          ? { RspCode: '02', Message: 'Order already confirmed' }
          : { RspCode: '00', Message: 'Confirm success' };
      } catch {
        return { RspCode: '99', Message: 'Unknown error' };
      }
    }
    if (current.status !== PaymentTransactionStatus.PENDING) {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const transaction = await tx.paymentTransaction.findUnique({
            where: { merchantTxnRef },
            include: transactionInclude,
          });
          if (
            !transaction ||
            transaction.status !== PaymentTransactionStatus.PENDING
          ) {
            return;
          }
          const now = new Date();
          const callback = this.vnpay.sanitizeCallback(query);
          await this.releaseReservedStock(tx, transaction, now);
          const cancelled = responseCode === '24';
          await tx.paymentTransaction.update({
            where: { id: transaction.id },
            data: {
              status: cancelled
                ? PaymentTransactionStatus.CANCELLED
                : PaymentTransactionStatus.FAILED,
              secureHashVerified: true,
              callbackPayloadSanitized: callback,
              responseCode,
              transactionStatus: providerStatus,
              callbackReceivedAt: now,
            },
          });
          await tx.payment.update({
            where: { id: transaction.paymentId },
            data: {
              status: cancelled
                ? PaymentStatus.CANCELLED
                : PaymentStatus.FAILED,
            },
          });
          await tx.order.update({
            where: { id: transaction.payment.orderId },
            data: {
              status: OrderStatus.PAYMENT_FAILED,
              stockRestoredAt: now,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch {
      return { RspCode: '99', Message: 'Unknown error' };
    }
    return { RspCode: '00', Message: 'Confirm success' };
  }

  async getStatus(actor: AuthenticatedUser, paymentId: string) {
    await this.expirePaymentIfNeeded(actor.id, paymentId);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, order: { userId: actor.id } },
      include: {
        order: true,
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!payment) this.notFound();
    return {
      paymentId: payment.id,
      orderId: payment.order.id,
      orderCode: payment.order.orderCode,
      orderStatus: payment.order.status,
      paymentStatus: payment.status,
      transactions: payment.transactions.map((transaction) => ({
        id: transaction.id,
        status: transaction.status,
        merchantTxnRef: transaction.merchantTxnRef,
        responseCode: transaction.responseCode,
        providerTransactionNo: transaction.providerTransactionNo,
        createdAt: transaction.createdAt.toISOString(),
      })),
    };
  }

  async queryProvider(
    actor: AuthenticatedUser,
    paymentId: string,
    ipAddress: string,
  ): Promise<Record<string, unknown>> {
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { paymentId, payment: { order: { userId: actor.id } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!transaction) this.notFound();
    return this.vnpay.queryTransaction({
      merchantTxnRef: transaction.merchantTxnRef,
      transactionCreatedAt: transaction.createdAt,
      ipAddress,
    });
  }

  async queryProviderTransaction(
    actor: AuthenticatedUser,
    transactionId: string,
    ipAddress: string,
  ): Promise<Record<string, unknown>> {
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: {
        id: transactionId,
        payment: { order: { userId: actor.id } },
      },
    });
    if (!transaction) this.notFound();
    return this.vnpay.queryTransaction({
      merchantTxnRef: transaction.merchantTxnRef,
      transactionCreatedAt: transaction.createdAt,
      ipAddress,
    });
  }

  async buildReturnRedirect(
    query: Readonly<Record<string, unknown>>,
  ): Promise<string> {
    const merchantTxnRef = this.text(query.vnp_TxnRef);
    let transaction: TransactionWithOrder | null;
    try {
      transaction = await this.prisma.paymentTransaction.findUnique({
        where: { merchantTxnRef },
        include: transactionInclude,
      });
    } catch {
      this.logger.error('Unable to load the VNPAY Return transaction');
      return this.vnpay.frontendResultUrl('unknown', 'processing');
    }
    const amount = Number(this.text(query.vnp_Amount));
    const validReturn =
      Boolean(transaction) &&
      this.hasValidVnpayAmount(amount, transaction!) &&
      this.isVerifiedVnpayCallback(query, transaction!);
    const responseCode = this.text(query.vnp_ResponseCode);
    const transactionStatus = this.text(query.vnp_TransactionStatus);
    let returnResult: VnpayReturnResult = !validReturn
      ? 'invalid'
      : responseCode === '24'
        ? 'cancelled'
        : responseCode === '00' && transactionStatus === '00'
          ? 'processing'
          : responseCode && transactionStatus
            ? 'failed'
            : 'processing';
    if (
      validReturn &&
      responseCode === '00' &&
      transactionStatus === '00' &&
      transaction
    ) {
      try {
        const result = await this.applySuccessfulVnpayTransaction(
          merchantTxnRef,
          query,
        );
        returnResult = result === 'rejected' ? 'processing' : 'success';
      } catch {
        this.logger.error(
          'Unable to persist the verified VNPAY Return success transition',
        );
        returnResult = 'processing';
      }
    }
    return this.vnpay.frontendResultUrl(
      transaction?.paymentId ?? 'unknown',
      returnResult,
    );
  }

  async retry(
    actor: AuthenticatedUser,
    paymentId: string,
    idempotencyKey: string,
    ipAddress: string,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, order: { userId: actor.id } },
      include: {
        order: { include: { items: true } },
        transactions: true,
      },
    });
    if (!payment) this.notFound();
    if (
      payment.status === PaymentStatus.PAID ||
      payment.transactions.some(
        (item) => item.status === PaymentTransactionStatus.PENDING,
      )
    ) {
      throw new ConflictException({
        code: 'VNPAY_RETRY_NOT_ALLOWED',
        message: 'Thanh toán hiện tại không thể thử lại.',
      });
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() +
        this.config.getOrThrow<number>('payment.vnpay.expireMinutes') * 60_000,
    );
    const transaction = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.paymentTransaction.findUnique({
          where: { idempotencyKey },
        });
        if (existing) return existing;
        const pending = await tx.paymentTransaction.findFirst({
          where: {
            paymentId: payment.id,
            status: PaymentTransactionStatus.PENDING,
          },
        });
        if (pending) {
          throw new ConflictException({
            code: 'VNPAY_RETRY_NOT_ALLOWED',
            message: 'Đã có một giao dịch thanh toán đang chờ.',
          });
        }
        const transactionId = ulid();
        for (const item of [...payment.order.items].sort((left, right) =>
          (left.variantId ?? '').localeCompare(right.variantId ?? ''),
        )) {
          if (!item.variantId) {
            throw new ConflictException({
              code: 'VNPAY_RETRY_REVALIDATION_CHANGED',
              message: 'Sản phẩm trong đơn không còn khả dụng.',
            });
          }
          const current = await tx.branchProductStock.findUnique({
            where: {
              branchId_variantId: {
                branchId: payment.order.branchId,
                variantId: item.variantId,
              },
            },
            select: { quantity: true },
          });
          const beforeQuantity = current?.quantity ?? 0;
          const stock = await tx.branchProductStock.updateMany({
            where: {
              branchId: payment.order.branchId,
              variantId: item.variantId,
              quantity: { equals: beforeQuantity, gte: item.quantity },
            },
            data: { quantity: { decrement: item.quantity } },
          });
          if (stock.count !== 1) {
            throw new ConflictException({
              code: 'VNPAY_RETRY_REVALIDATION_CHANGED',
              message: 'Tồn kho đã thay đổi, không thể thanh toán lại.',
            });
          }
          await recordInventoryMovement(tx, {
            branchId: payment.order.branchId,
            variantId: item.variantId,
            type: InventoryMovementType.ORDER_STOCK_DEDUCTED,
            quantityChange: -item.quantity,
            beforeQuantity,
            afterQuantity: beforeQuantity - item.quantity,
            reason: 'Thanh toán lại qua VNPAY',
            sourceType: InventoryMovementSourceType.ORDER,
            sourceId: transactionId,
            sourceCode: payment.order.orderCode,
            actorId: actor.id,
          });
        }
        const created = await tx.paymentTransaction.create({
          data: {
            id: transactionId,
            paymentId: payment.id,
            amount: payment.amount,
            idempotencyKey,
            merchantTxnRef: `BK${ulid()}`,
            expiresAt,
            stockReservedAt: now,
          },
        });
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.PENDING },
        });
        await tx.order.update({
          where: { id: payment.order.id },
          data: { status: OrderStatus.PENDING_PAYMENT, stockRestoredAt: null },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const request = this.vnpay.buildPaymentUrl({
      merchantTxnRef: transaction.merchantTxnRef,
      amount: Number(transaction.amount),
      orderCode: payment.order.orderCode,
      ipAddress,
      createdAt: transaction.createdAt,
      expiresAt: transaction.expiresAt!,
    });
    await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { requestPayloadSanitized: request.sanitizedRequest },
    });
    return {
      paymentId: payment.id,
      paymentTransactionId: transaction.id,
      paymentUrl: request.paymentUrl,
    };
  }

  private async applySuccessfulVnpayTransaction(
    merchantTxnRef: string,
    query: Readonly<Record<string, unknown>>,
  ): Promise<SuccessfulVnpayTransitionResult> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const transaction = await tx.paymentTransaction.findUnique({
        where: { merchantTxnRef },
        include: transactionInclude,
      });
      const responseCode = this.text(query.vnp_ResponseCode);
      const providerStatus = this.text(query.vnp_TransactionStatus);
      const amount = Number(this.text(query.vnp_Amount));
      if (
        !transaction ||
        responseCode !== '00' ||
        providerStatus !== '00' ||
        !this.hasValidVnpayAmount(amount, transaction) ||
        !this.isVerifiedVnpayCallback(query, transaction)
      ) {
        return 'rejected';
      }
      if (transaction.status === PaymentTransactionStatus.PAID) {
        return transaction.payment.status === PaymentStatus.PAID &&
          transaction.stockConsumedAt !== null &&
          transaction.stockReleasedAt === null
          ? 'already-applied'
          : 'rejected';
      }
      const superseded = transaction.payment.transactions.some(
        (attempt) =>
          attempt.id !== transaction.id &&
          (attempt.status === PaymentTransactionStatus.PAID ||
            attempt.createdAt > transaction.createdAt),
      );
      if (
        superseded ||
        transaction.status !== PaymentTransactionStatus.PENDING ||
        transaction.payment.status !== PaymentStatus.PENDING ||
        transaction.payment.order.status !== OrderStatus.PENDING_PAYMENT ||
        transaction.stockReservedAt === null ||
        transaction.stockReleasedAt !== null ||
        transaction.stockConsumedAt !== null
      ) {
        return 'rejected';
      }

      const now = new Date();
      const consumed = await tx.paymentTransaction.updateMany({
        where: {
          id: transaction.id,
          status: PaymentTransactionStatus.PENDING,
          stockReservedAt: { not: null },
          stockReleasedAt: null,
          stockConsumedAt: null,
        },
        data: {
          status: PaymentTransactionStatus.PAID,
          stockConsumedAt: now,
          secureHashVerified: true,
          callbackPayloadSanitized: this.vnpay.sanitizeCallback(query),
          providerTransactionNo: this.text(query.vnp_TransactionNo) || null,
          bankCode: this.text(query.vnp_BankCode) || null,
          cardType: this.text(query.vnp_CardType) || null,
          responseCode,
          transactionStatus: providerStatus,
          callbackReceivedAt: now,
          payDate: this.parseVnpayDate(this.text(query.vnp_PayDate)),
        },
      });
      if (consumed.count !== 1) return 'rejected';

      await tx.payment.update({
        where: { id: transaction.paymentId },
        data: { status: PaymentStatus.PAID, paidAt: now },
      });
      await tx.order.update({
        where: { id: transaction.payment.orderId },
        data: {
          status: OrderStatus.PENDING,
          stockDeductedAt: now,
        },
      });
      await this.consumeCart(tx, transaction);
      return 'applied';
    });
  }

  private hasValidVnpayAmount(
    callbackAmount: number,
    transaction: TransactionWithOrder,
  ): boolean {
    return (
      Number.isSafeInteger(callbackAmount) &&
      callbackAmount === Number(transaction.amount) * 100
    );
  }

  private isVerifiedVnpayCallback(
    query: Readonly<Record<string, unknown>>,
    transaction: TransactionWithOrder,
  ): boolean {
    const callbackCurrencyPresent = Object.prototype.hasOwnProperty.call(
      query,
      'vnp_CurrCode',
    );
    const callbackCurrency = this.text(query.vnp_CurrCode);
    const expectedCurrency = this.config.getOrThrow<string>(
      'payment.vnpay.currency',
    );
    const paymentGraphValid =
      transaction.provider === PaymentProvider.VNPAY &&
      transaction.paymentId === transaction.payment.id &&
      transaction.payment.method === PaymentMethod.VNPAY &&
      transaction.payment.orderId === transaction.payment.order.id &&
      Number(transaction.amount) === Number(transaction.payment.amount) &&
      transaction.currency === transaction.payment.currency &&
      Number(transaction.payment.amount) ===
        Number(transaction.payment.order.totalAmount);

    return (
      this.vnpay.verify(query) &&
      this.text(query.vnp_TmnCode) ===
        this.config.getOrThrow<string>('payment.vnpay.tmnCode') &&
      this.text(query.vnp_TxnRef) === transaction.merchantTxnRef &&
      paymentGraphValid &&
      (!callbackCurrencyPresent ||
        (callbackCurrency === expectedCurrency &&
          callbackCurrency === transaction.currency))
    );
  }

  private async consumeCart(
    tx: Prisma.TransactionClient,
    transaction: TransactionWithOrder,
  ): Promise<void> {
    const cartItemIds = transaction.payment.order.items.flatMap((item) =>
      item.sourceCartItemId ? [item.sourceCartItemId] : [],
    );
    if (cartItemIds.length === 0) return;
    await tx.cartItem.deleteMany({
      where: {
        id: { in: cartItemIds },
        cart: { userId: transaction.payment.order.userId },
      },
    });
  }

  private async releaseReservedStock(
    tx: Prisma.TransactionClient,
    transaction: TransactionWithOrder,
    releasedAt: Date,
  ): Promise<boolean> {
    const claimed = await tx.paymentTransaction.updateMany({
      where: {
        id: transaction.id,
        stockReservedAt: { not: null },
        stockReleasedAt: null,
        stockConsumedAt: null,
      },
      data: { stockReleasedAt: releasedAt },
    });
    if (claimed.count !== 1) return false;
    for (const item of transaction.payment.order.items) {
      if (!item.variantId) continue;
      const stock = await tx.branchProductStock.update({
        where: {
          branchId_variantId: {
            branchId: transaction.payment.order.branchId,
            variantId: item.variantId,
          },
        },
        data: { quantity: { increment: item.quantity } },
        select: { quantity: true },
      });
      await recordInventoryMovement(tx, {
        branchId: transaction.payment.order.branchId,
        variantId: item.variantId,
        type: InventoryMovementType.ORDER_STOCK_RESTORED,
        quantityChange: item.quantity,
        beforeQuantity: stock.quantity - item.quantity,
        afterQuantity: stock.quantity,
        reason: 'Giải phóng tồn do giao dịch VNPAY không hoàn tất',
        sourceType: InventoryMovementSourceType.ORDER,
        sourceId: transaction.id,
        sourceCode: transaction.payment.order.orderCode,
        actorId: null,
      });
    }
    return true;
  }

  private async expirePaymentIfNeeded(
    userId: string,
    paymentId: string,
  ): Promise<void> {
    const current = await this.prisma.paymentTransaction.findFirst({
      where: {
        paymentId,
        payment: { order: { userId } },
        status: PaymentTransactionStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      include: transactionInclude,
    });
    if (!current) return;
    await this.prisma.$transaction(
      async (tx) => {
        const transaction = await tx.paymentTransaction.findUnique({
          where: { id: current.id },
          include: transactionInclude,
        });
        if (
          !transaction ||
          transaction.status !== PaymentTransactionStatus.PENDING
        ) {
          return;
        }
        const now = new Date();
        if (!(await this.releaseReservedStock(tx, transaction, now))) return;
        await tx.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: PaymentTransactionStatus.EXPIRED },
        });
        await tx.payment.update({
          where: { id: transaction.paymentId },
          data: { status: PaymentStatus.EXPIRED },
        });
        await tx.order.update({
          where: { id: transaction.payment.orderId },
          data: {
            status: OrderStatus.PAYMENT_FAILED,
            stockRestoredAt: now,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private parseVnpayDate(value: string): Date | null {
    if (!/^\d{14}$/.test(value)) return null;
    const utc = Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8)),
      Number(value.slice(8, 10)) - 7,
      Number(value.slice(10, 12)),
      Number(value.slice(12, 14)),
    );
    const date = new Date(utc);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'PAYMENT_NOT_FOUND',
      message: 'Không tìm thấy giao dịch thanh toán.',
    });
  }
}
