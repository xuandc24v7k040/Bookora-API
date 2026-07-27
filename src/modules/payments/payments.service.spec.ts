import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import {
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionStatus,
  type Prisma,
} from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { VnpayService } from '@/modules/integrations/vnpay/vnpay.service';
import { PaymentsService } from './payments.service';

type TransactionCallback = (tx: Prisma.TransactionClient) => Promise<unknown>;

function transactionFixture() {
  const createdAt = new Date('2026-07-25T01:00:00.000Z');
  const transaction = {
    id: 'payment-transaction-id',
    paymentId: 'payment-public-id',
    provider: PaymentProvider.VNPAY,
    status: PaymentTransactionStatus.PENDING as PaymentTransactionStatus,
    amount: 520_000,
    currency: 'VND',
    merchantTxnRef: 'BK01TEST',
    providerTransactionNo: null as string | null,
    bankCode: null as string | null,
    cardType: null as string | null,
    responseCode: null as string | null,
    transactionStatus: null as string | null,
    secureHashVerified: false,
    callbackPayloadSanitized: null as Record<string, string> | null,
    callbackReceivedAt: null as Date | null,
    payDate: null as Date | null,
    stockReservedAt: new Date('2026-07-25T01:00:00.000Z'),
    stockReleasedAt: null as Date | null,
    stockConsumedAt: null as Date | null,
    createdAt,
    payment: {
      id: 'payment-public-id',
      orderId: 'order-id',
      method: PaymentMethod.VNPAY,
      status: PaymentStatus.PENDING as PaymentStatus,
      amount: 520_000,
      currency: 'VND',
      paidAt: null as Date | null,
      order: {
        id: 'order-id',
        userId: 'customer-id',
        branchId: 'branch-id',
        status: OrderStatus.PENDING_PAYMENT as OrderStatus,
        totalAmount: 520_000,
        stockDeductedAt: null as Date | null,
        items: [
          {
            id: 'order-item-id',
            variantId: 'variant-id',
            quantity: 1,
            sourceCartItemId: 'selected-cart-item-id',
          },
        ],
      },
      transactions: [] as Array<{
        id: string;
        status: PaymentTransactionStatus;
        createdAt: Date;
      }>,
    },
  };
  transaction.payment.transactions = [
    {
      id: transaction.id,
      status: transaction.status,
      createdAt,
    },
  ];
  return transaction;
}

describe('PaymentsService VNPAY verified callbacks', () => {
  const hashSecret = 'unit-test-secret';
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'payment.vnpay.tmnCode': 'BOOKORA',
        'payment.vnpay.hashSecret': hashSecret,
        'payment.vnpay.currency': 'VND',
        'payment.vnpay.frontendResultUrl':
          'http://localhost:5173/checkout/payment-result',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const findUnique = jest.fn();
  const transactionFindUnique = jest.fn();
  const transactionUpdateMany = jest.fn();
  const paymentUpdate = jest.fn();
  const orderUpdate = jest.fn();
  const cartItemDeleteMany = jest.fn();
  const stockUpdate = jest.fn();
  const statusHistoryCreate = jest.fn();
  const transactionMock = jest.fn();
  const transactionClient = {
    paymentTransaction: {
      findUnique: transactionFindUnique,
      updateMany: transactionUpdateMany,
      update: jest.fn(),
    },
    payment: { update: paymentUpdate },
    order: { update: orderUpdate },
    cartItem: { deleteMany: cartItemDeleteMany },
    branchProductStock: { update: stockUpdate },
    orderStatusHistory: { create: statusHistoryCreate },
  };
  const prisma = {
    paymentTransaction: { findUnique },
    $transaction: transactionMock,
  } as unknown as PrismaService;
  const vnpay = new VnpayService(config);
  const service = new PaymentsService(prisma, vnpay, config);
  let transaction = transactionFixture();
  let transactionQueue: Promise<void> = Promise.resolve();

  function signedQuery(
    overrides: Record<string, string> = {},
  ): Record<string, string> {
    const params = {
      vnp_Amount: '52000000',
      vnp_BankCode: 'NCB',
      vnp_CardType: 'ATM',
      vnp_CurrCode: 'VND',
      vnp_PayDate: '20260725083000',
      vnp_ResponseCode: '00',
      vnp_TmnCode: 'BOOKORA',
      vnp_TransactionNo: 'provider-transaction-no',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: 'BK01TEST',
      ...overrides,
    };
    const canonical = Object.keys(params)
      .sort()
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`,
      )
      .join('&');
    return {
      ...params,
      vnp_SecureHash: createHmac('sha512', hashSecret)
        .update(canonical)
        .digest('hex'),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    transaction = transactionFixture();
    transactionQueue = Promise.resolve();
    findUnique.mockImplementation(() => Promise.resolve(transaction));
    transactionFindUnique.mockImplementation(() =>
      Promise.resolve(transaction),
    );
    transactionUpdateMany.mockImplementation(
      ({
        data,
      }: {
        data: Partial<typeof transaction>;
      }): Promise<{ count: number }> => {
        if (
          transaction.status !== PaymentTransactionStatus.PENDING ||
          transaction.stockReservedAt === null ||
          transaction.stockReleasedAt !== null ||
          transaction.stockConsumedAt !== null
        ) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(transaction, data);
        transaction.payment.transactions[0].status = transaction.status;
        return Promise.resolve({ count: 1 });
      },
    );
    paymentUpdate.mockImplementation(
      ({ data }: { data: { status: PaymentStatus; paidAt: Date } }) => {
        Object.assign(transaction.payment, data);
        return Promise.resolve(transaction.payment);
      },
    );
    orderUpdate.mockImplementation(
      ({ data }: { data: { status: OrderStatus; stockDeductedAt: Date } }) => {
        Object.assign(transaction.payment.order, data);
        return Promise.resolve(transaction.payment.order);
      },
    );
    cartItemDeleteMany.mockResolvedValue({ count: 1 });
    statusHistoryCreate.mockResolvedValue({ id: 'status-history-id' });
    transactionMock.mockImplementation((callback: TransactionCallback) => {
      const result = transactionQueue.then(() =>
        callback(transactionClient as unknown as Prisma.TransactionClient),
      );
      transactionQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    });
  });

  it('persists a fully verified Return before redirecting success', async () => {
    const url = new URL(await service.buildReturnRedirect(signedQuery()));

    expect(url.pathname).toBe('/checkout/payment-result');
    expect(url.searchParams.get('paymentId')).toBe('payment-public-id');
    expect(url.searchParams.get('returnResult')).toBe('success');
    expect(transaction.status).toBe(PaymentTransactionStatus.PAID);
    expect(transaction.secureHashVerified).toBe(true);
    expect(transaction.providerTransactionNo).toBe('provider-transaction-no');
    expect(transaction.bankCode).toBe('NCB');
    expect(transaction.stockConsumedAt).toBeInstanceOf(Date);
    expect(transaction.stockReleasedAt).toBeNull();
    expect(transaction.payment.status).toBe(PaymentStatus.PAID);
    expect(transaction.payment.order.status).toBe(OrderStatus.PENDING);
    expect(stockUpdate).not.toHaveBeenCalled();
    expect(cartItemDeleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['selected-cart-item-id'] },
        cart: { userId: 'customer-id' },
      },
    });
  });

  it.each([
    ['wrong TmnCode', { vnp_TmnCode: 'OTHER_MERCHANT' }, 'invalid'],
    ['amount mismatch', { vnp_Amount: '1' }, 'invalid'],
    ['currency mismatch', { vnp_CurrCode: 'USD' }, 'invalid'],
    [
      'response success without transaction success',
      { vnp_TransactionStatus: '02' },
      'failed',
    ],
    [
      'transaction success without response success',
      { vnp_ResponseCode: '99' },
      'failed',
    ],
  ])(
    'does not mutate state for %s',
    async (_caseName, overrides, expectedResult) => {
      const url = new URL(
        await service.buildReturnRedirect(signedQuery(overrides)),
      );

      expect(url.searchParams.get('returnResult')).toBe(expectedResult);
      expect(transactionMock).not.toHaveBeenCalled();
      expect(transaction.status).toBe(PaymentTransactionStatus.PENDING);
      expect(transaction.payment.status).toBe(PaymentStatus.PENDING);
      expect(transaction.payment.order.status).toBe(
        OrderStatus.PENDING_PAYMENT,
      );
      expect(cartItemDeleteMany).not.toHaveBeenCalled();
      expect(stockUpdate).not.toHaveBeenCalled();
    },
  );

  it('does not mutate state for an invalid signature', async () => {
    const query = signedQuery();
    query.vnp_Amount = '1';

    const url = new URL(await service.buildReturnRedirect(query));

    expect(url.searchParams.get('returnResult')).toBe('invalid');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('does not mutate state for an unknown TxnRef', async () => {
    findUnique.mockResolvedValueOnce(null);

    const url = new URL(await service.buildReturnRedirect(signedQuery()));

    expect(url.searchParams.get('paymentId')).toBe('unknown');
    expect(url.searchParams.get('returnResult')).toBe('invalid');
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('keeps a cancelled browser Return pending with its reservation and cart', async () => {
    const url = new URL(
      await service.buildReturnRedirect(
        signedQuery({
          vnp_ResponseCode: '24',
          vnp_TransactionStatus: '02',
        }),
      ),
    );

    expect(url.searchParams.get('returnResult')).toBe('cancelled');
    expect(transactionMock).not.toHaveBeenCalled();
    expect(transaction.status).toBe(PaymentTransactionStatus.PENDING);
    expect(transaction.stockReservedAt).toBeInstanceOf(Date);
    expect(transaction.stockReleasedAt).toBeNull();
    expect(cartItemDeleteMany).not.toHaveBeenCalled();
  });

  it('treats duplicate Return success as an idempotent no-op', async () => {
    await service.buildReturnRedirect(signedQuery());
    const duplicate = new URL(await service.buildReturnRedirect(signedQuery()));

    expect(duplicate.searchParams.get('returnResult')).toBe('success');
    expect(transactionUpdateMany).toHaveBeenCalledTimes(1);
    expect(paymentUpdate).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledTimes(1);
    expect(cartItemDeleteMany).toHaveBeenCalledTimes(1);
    expect(stockUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['Return then IPN', true],
    ['IPN then Return', false],
  ])(
    'shares one idempotent success transition for %s',
    async (_caseName, returnFirst) => {
      const query = signedQuery();
      if (returnFirst) {
        await service.buildReturnRedirect(query);
        await expect(service.handleVnpayIpn(query)).resolves.toEqual({
          RspCode: '00',
          Message: 'Confirm success',
        });
      } else {
        await expect(service.handleVnpayIpn(query)).resolves.toEqual({
          RspCode: '00',
          Message: 'Confirm success',
        });
        const url = new URL(await service.buildReturnRedirect(query));
        expect(url.searchParams.get('returnResult')).toBe('success');
      }

      expect(transactionUpdateMany).toHaveBeenCalledTimes(1);
      expect(paymentUpdate).toHaveBeenCalledTimes(1);
      expect(orderUpdate).toHaveBeenCalledTimes(1);
      expect(cartItemDeleteMany).toHaveBeenCalledTimes(1);
      expect(stockUpdate).not.toHaveBeenCalled();
    },
  );

  it('handles parallel Return/IPN success without duplicate side effects', async () => {
    const query = signedQuery();

    const [returnUrl, ipnResult] = await Promise.all([
      service.buildReturnRedirect(query),
      service.handleVnpayIpn(query),
    ]);

    expect(new URL(returnUrl).searchParams.get('returnResult')).toBe('success');
    expect(ipnResult).toEqual({
      RspCode: '00',
      Message: 'Confirm success',
    });
    expect(transactionUpdateMany).toHaveBeenCalledTimes(1);
    expect(cartItemDeleteMany).toHaveBeenCalledTimes(1);
    expect(stockUpdate).not.toHaveBeenCalled();
  });
});
