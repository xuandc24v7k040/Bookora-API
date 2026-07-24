import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ulid } from 'ulid';
import {
  OrderStatus,
  PaymentStatus,
  PaymentTransactionStatus,
  Prisma,
} from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { PrismaService } from '@/database/prisma.service';
import { VnpayService } from '@/modules/integrations/vnpay/vnpay.service';

interface VnpayIpnResult {
  RspCode: string;
  Message: string;
}

const transactionInclude = {
  payment: {
    include: {
      order: { include: { items: true } },
    },
  },
} satisfies Prisma.PaymentTransactionInclude;

type TransactionWithOrder = Prisma.PaymentTransactionGetPayload<{
  include: typeof transactionInclude;
}>;

@Injectable()
export class PaymentsService {
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
    });
    if (!current) return { RspCode: '01', Message: 'Order not found' };
    if (
      !Number.isSafeInteger(amount) ||
      amount !== Number(current.amount) * 100
    ) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }
    if (current.status !== PaymentTransactionStatus.PENDING) {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    const responseCode = this.text(query.vnp_ResponseCode);
    const providerStatus = this.text(query.vnp_TransactionStatus);
    const succeeded = responseCode === '00' && providerStatus === '00';
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
          if (succeeded) {
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
                callbackPayloadSanitized: callback,
                providerTransactionNo:
                  this.text(query.vnp_TransactionNo) || null,
                bankCode: this.text(query.vnp_BankCode) || null,
                cardType: this.text(query.vnp_CardType) || null,
                responseCode,
                transactionStatus: providerStatus,
                callbackReceivedAt: now,
                payDate: this.parseVnpayDate(this.text(query.vnp_PayDate)),
              },
            });
            if (consumed.count !== 1) return;
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
            return;
          }

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
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { merchantTxnRef },
      select: { paymentId: true, amount: true },
    });
    const amount = Number(this.text(query.vnp_Amount));
    const validReturn =
      this.vnpay.verify(query) &&
      Boolean(transaction) &&
      this.text(query.vnp_TmnCode) ===
        this.config.getOrThrow<string>('payment.vnpay.tmnCode') &&
      Number.isSafeInteger(amount) &&
      amount === Number(transaction?.amount) * 100;
    const responseCode = this.text(query.vnp_ResponseCode);
    const transactionStatus = this.text(query.vnp_TransactionStatus);
    const returnResult = !validReturn
      ? 'invalid'
      : responseCode === '24'
        ? 'cancelled'
        : responseCode === '00' && transactionStatus === '00'
          ? 'success'
          : responseCode && transactionStatus
            ? 'failed'
            : 'processing';
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
        for (const item of [...payment.order.items].sort((left, right) =>
          (left.variantId ?? '').localeCompare(right.variantId ?? ''),
        )) {
          if (!item.variantId) {
            throw new ConflictException({
              code: 'VNPAY_RETRY_REVALIDATION_CHANGED',
              message: 'Sản phẩm trong đơn không còn khả dụng.',
            });
          }
          const stock = await tx.branchProductStock.updateMany({
            where: {
              branchId: payment.order.branchId,
              variantId: item.variantId,
              quantity: { gte: item.quantity },
            },
            data: { quantity: { decrement: item.quantity } },
          });
          if (stock.count !== 1) {
            throw new ConflictException({
              code: 'VNPAY_RETRY_REVALIDATION_CHANGED',
              message: 'Tồn kho đã thay đổi, không thể thanh toán lại.',
            });
          }
        }
        const created = await tx.paymentTransaction.create({
          data: {
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
      await tx.branchProductStock.update({
        where: {
          branchId_variantId: {
            branchId: transaction.payment.order.branchId,
            variantId: item.variantId,
          },
        },
        data: { quantity: { increment: item.quantity } },
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
