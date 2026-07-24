import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '@/database/prisma.service';
import { VnpayService } from '@/modules/integrations/vnpay/vnpay.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService VNPAY Return', () => {
  const hashSecret = 'unit-test-secret';
  const transactionMock = jest.fn();
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'payment.vnpay.tmnCode': 'BOOKORA',
        'payment.vnpay.hashSecret': hashSecret,
        'payment.vnpay.frontendResultUrl':
          'http://localhost:5173/checkout/payment-result',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const prisma = {
    paymentTransaction: {
      findUnique: jest.fn(),
    },
    $transaction: transactionMock,
  } as unknown as PrismaService;
  const vnpay = new VnpayService(config);
  const service = new PaymentsService(prisma, vnpay, config);

  function signedQuery(
    overrides: Record<string, string> = {},
  ): Record<string, string> {
    const params = {
      vnp_Amount: '52000000',
      vnp_ResponseCode: '00',
      vnp_TmnCode: 'BOOKORA',
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
    (
      prisma.paymentTransaction.findUnique as jest.MockedFunction<
        typeof prisma.paymentTransaction.findUnique
      >
    ).mockResolvedValue({
      paymentId: 'payment-public-id',
      amount: 520_000,
    } as never);
  });

  it.each([
    [{}, 'success'],
    [{ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }, 'cancelled'],
    [{ vnp_ResponseCode: '99', vnp_TransactionStatus: '02' }, 'failed'],
  ])(
    'redirects a verified Return to the safe result page',
    async (fields, hint) => {
      const url = new URL(
        await service.buildReturnRedirect(signedQuery(fields)),
      );

      expect(url.pathname).toBe('/checkout/payment-result');
      expect(url.searchParams.get('paymentId')).toBe('payment-public-id');
      expect(url.searchParams.get('returnResult')).toBe(hint);
    },
  );

  it('uses a controlled invalid result for a tampered Return', async () => {
    const query = signedQuery();
    query.vnp_Amount = '1';

    const url = new URL(await service.buildReturnRedirect(query));

    expect(url.searchParams.get('returnResult')).toBe('invalid');
    expect([...url.searchParams.keys()]).toEqual(['paymentId', 'returnResult']);
  });

  it('does not mutate payment, order or stock for a cancelled browser Return', async () => {
    await service.buildReturnRedirect(
      signedQuery({
        vnp_ResponseCode: '24',
        vnp_TransactionStatus: '02',
      }),
    );

    expect(transactionMock).not.toHaveBeenCalled();
  });
});
