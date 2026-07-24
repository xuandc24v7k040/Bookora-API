import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import qs from 'qs';
import {
  normalizeVnpayIpAddress,
  sanitizeVnpayOrderInfo,
  serializeVnpayParams,
  sortVnpayParams,
  VnpayService,
} from './vnpay.service';

const values: Record<string, unknown> = {
  'payment.vnpay.version': '2.1.0',
  'payment.vnpay.command': 'pay',
  'payment.vnpay.tmnCode': 'BOOKORA',
  'payment.vnpay.currency': 'VND',
  'payment.vnpay.locale': 'vn',
  'payment.vnpay.orderType': 'other',
  'payment.vnpay.returnUrl':
    'http://localhost:8000/api/v1/payments/vnpay/return',
  'payment.vnpay.paymentUrl':
    'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  'payment.vnpay.hashSecret': 'unit-test-secret',
  'payment.vnpay.frontendResultUrl':
    'http://localhost:5173/checkout/payment-result',
};

describe('VnpayService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => values[key]),
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  const service = new VnpayService(config);

  it('restores the Hotfix 6 create-payment request shape', () => {
    const result = service.buildPaymentUrl({
      merchantTxnRef: 'BK01KY8ZFTPTNPTRQB7NH8GZE1PK',
      amount: 44_000,
      orderCode: 'BK-01KY8ZFTPT8JHWVA6ET6Q153YA',
      ipAddress: '::1',
      createdAt: new Date('2026-07-24T02:32:51.000Z'),
      expiresAt: new Date('2026-07-24T02:47:51.000Z'),
    });

    expect(result.sanitizedRequest.vnp_Amount).toBe('4400000');
    expect(result.sanitizedRequest.vnp_IpAddr).toBe('::1');
    expect(result.sanitizedRequest.vnp_OrderInfo).toBe(
      'Thanh toan don hang BK-01KY8ZFTPT8JHWVA6ET6Q153YA',
    );
    expect(result.sanitizedRequest.vnp_ExpireDate).toBe('20260724094751');
    expect(result.paymentUrl).toContain('vnp_IpAddr=%3A%3A1');
    expect(result.paymentUrl).toContain(
      'vnp_OrderInfo=Thanh+toan+don+hang+BK-01KY8ZFTPT8JHWVA6ET6Q153YA',
    );
  });

  it.each([
    ['::1', '127.0.0.1'],
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['::ffff:10.20.30.40', '10.20.30.40'],
    ['10.20.30.40', '10.20.30.40'],
    ['not-an-ip', '127.0.0.1'],
  ])('normalizes VNPAY client IP %s', (input, expected) => {
    expect(normalizeVnpayIpAddress(input)).toBe(expected);
  });

  it('sanitizes OrderInfo without changing the Bookora display order code', () => {
    const orderCode = 'BK-ĐƠN_01';

    expect(sanitizeVnpayOrderInfo(`Thanh toán đơn hàng ${orderCode}`)).toBe(
      'Thanh toan don hang BK DON 01',
    );
    expect(orderCode).toBe('BK-ĐƠN_01');
  });

  it('rejects a TxnRef containing provider-unsafe characters', () => {
    expect(() =>
      service.buildPaymentUrl({
        merchantTxnRef: 'BK-UNSAFE',
        amount: 59_000,
        orderCode: 'BK-01',
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-07-23T03:00:00.000Z'),
        expiresAt: new Date('2026-07-23T03:15:00.000Z'),
      }),
    ).toThrow('Mã tham chiếu VNPAY không hợp lệ.');
  });

  it('matches the local NodeJS sample canonical form and golden signature', () => {
    const result = service.buildPaymentUrl({
      merchantTxnRef: 'BK01TEST',
      amount: 520_000,
      orderCode: 'BK Đơn hàng',
      ipAddress: '127.0.0.1',
      createdAt: new Date('2026-07-23T03:00:00.000Z'),
      expiresAt: new Date('2026-07-23T03:15:00.000Z'),
    });
    const sampleSortedParams = Object.fromEntries(
      Object.keys(result.sanitizedRequest)
        .map(encodeURIComponent)
        .sort()
        .map((key) => [
          key,
          encodeURIComponent(result.sanitizedRequest[key]).replace(/%20/g, '+'),
        ]),
    );
    const sampleSignData = qs.stringify(sampleSortedParams, { encode: false });
    const sampleSignature = createHmac('sha512', 'unit-test-secret')
      .update(sampleSignData, 'utf8')
      .digest('hex');
    const sampleFinalQuery = qs.stringify(
      { ...sampleSortedParams, vnp_SecureHash: sampleSignature },
      { encode: false },
    );

    expect(sortVnpayParams(result.sanitizedRequest)).toEqual(
      sampleSortedParams,
    );
    expect(sampleSignData).toContain('vnp_OrderInfo=Thanh+toan+don+hang+BK+');
    expect(serializeVnpayParams(result.sanitizedRequest)).toBe(sampleSignData);
    expect(result.paymentUrl).toBe(
      `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?${sampleFinalQuery}`,
    );
    expect(new URL(result.paymentUrl).searchParams.get('vnp_SecureHash')).toBe(
      sampleSignature,
    );
  });

  it('matches the hardcoded Hotfix 6 order.js golden fixture', () => {
    const result = service.buildPaymentUrl({
      merchantTxnRef: 'BK01KY8ZFTPTNPTRQB7NH8GZE1PK',
      amount: 44_000,
      orderCode: 'BK-01KY8ZFTPT8JHWVA6ET6Q153YA',
      ipAddress: '::1',
      createdAt: new Date('2026-07-24T02:32:51.000Z'),
      expiresAt: new Date('2026-07-24T02:47:51.000Z'),
    });
    const expectedSortedParams = {
      vnp_Amount: '4400000',
      vnp_Command: 'pay',
      vnp_CreateDate: '20260724093251',
      vnp_CurrCode: 'VND',
      vnp_ExpireDate: '20260724094751',
      vnp_IpAddr: '%3A%3A1',
      vnp_Locale: 'vn',
      vnp_OrderInfo: 'Thanh+toan+don+hang+BK-01KY8ZFTPT8JHWVA6ET6Q153YA',
      vnp_OrderType: 'other',
      vnp_ReturnUrl:
        'http%3A%2F%2Flocalhost%3A8000%2Fapi%2Fv1%2Fpayments%2Fvnpay%2Freturn',
      vnp_TmnCode: 'BOOKORA',
      vnp_TxnRef: 'BK01KY8ZFTPTNPTRQB7NH8GZE1PK',
      vnp_Version: '2.1.0',
    };
    const expectedSignData =
      'vnp_Amount=4400000&vnp_Command=pay&vnp_CreateDate=20260724093251&vnp_CurrCode=VND&vnp_ExpireDate=20260724094751&vnp_IpAddr=%3A%3A1&vnp_Locale=vn&vnp_OrderInfo=Thanh+toan+don+hang+BK-01KY8ZFTPT8JHWVA6ET6Q153YA&vnp_OrderType=other&vnp_ReturnUrl=http%3A%2F%2Flocalhost%3A8000%2Fapi%2Fv1%2Fpayments%2Fvnpay%2Freturn&vnp_TmnCode=BOOKORA&vnp_TxnRef=BK01KY8ZFTPTNPTRQB7NH8GZE1PK&vnp_Version=2.1.0';
    const expectedSecureHash =
      'c09801e0c5e6c6617417e7f1a7e93092ca12167de400e1a4519c127bfb55bf58d40e2885e274e0971fea5aa37c09947840499745434484274cfdc68bb3fb5ea1';
    const expectedFinalQuery = `${expectedSignData}&vnp_SecureHash=${expectedSecureHash}`;

    expect(sortVnpayParams(result.sanitizedRequest)).toEqual(
      expectedSortedParams,
    );
    expect(serializeVnpayParams(result.sanitizedRequest)).toBe(
      expectedSignData,
    );
    expect(
      createHmac('sha512', 'unit-test-secret')
        .update(expectedSignData, 'utf8')
        .digest('hex'),
    ).toBe(expectedSecureHash);
    expect(expectedSecureHash).toMatch(/^[a-f0-9]{128}$/);
    expect(result.paymentUrl).toBe(
      `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?${expectedFinalQuery}`,
    );
  });

  it('accepts an authentic callback and rejects a tampered amount', () => {
    const params: Record<string, string> = {
      vnp_Amount: '52000000',
      vnp_ResponseCode: '00',
      vnp_TmnCode: 'BOOKORA',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: 'BK01TEST',
    };
    const canonical = Object.keys(params)
      .sort()
      .map(
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`,
      )
      .join('&');
    const signature = createHmac('sha512', 'unit-test-secret')
      .update(canonical, 'utf8')
      .digest('hex');
    expect(service.verify({ ...params, vnp_SecureHash: signature })).toBe(true);
    expect(
      service.verify({
        ...params,
        vnp_Amount: '1',
        vnp_SecureHash: signature,
      }),
    ).toBe(false);
  });

  it('builds a safe frontend result URL without forwarding provider params', () => {
    const result = service.frontendResultUrl('payment-public-id', 'cancelled');
    const url = new URL(result);

    expect(url.pathname).toBe('/checkout/payment-result');
    expect(url.searchParams.get('paymentId')).toBe('payment-public-id');
    expect(url.searchParams.get('returnResult')).toBe('cancelled');
    expect([...url.searchParams.keys()]).toEqual(['paymentId', 'returnResult']);
  });
});
