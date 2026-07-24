import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import qs from 'qs';

export interface VnpayPaymentInput {
  merchantTxnRef: string;
  amount: number;
  orderCode: string;
  ipAddress: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface VnpayQueryInput {
  merchantTxnRef: string;
  transactionCreatedAt: Date;
  ipAddress: string;
}

export type VnpayReturnResult =
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'invalid'
  | 'processing';

export function normalizeVnpayIpAddress(value: string): string {
  const candidate = value.split(',')[0]?.trim() ?? '';
  if (candidate === '::1') return '127.0.0.1';
  const mappedIpv4 = candidate.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mappedIpv4?.[1] && isIP(mappedIpv4[1]) === 4) return mappedIpv4[1];
  if (isIP(candidate) > 0) return candidate;
  return '127.0.0.1';
}

export function sanitizeVnpayOrderInfo(value: string): string {
  return value
    .replace(/[đĐ]/g, (letter) => (letter === 'đ' ? 'd' : 'D'))
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255)
    .trim();
}

function requireVnpayTxnRef(value: string): string {
  if (!/^[A-Za-z0-9]{1,100}$/.test(value)) {
    throw new Error('Mã tham chiếu VNPAY không hợp lệ.');
  }
  return value;
}

export function sortVnpayParams(
  params: Readonly<Record<string, string>>,
): Record<string, string> {
  const sorted: Record<string, string> = {};
  const keys: string[] = [];

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      keys.push(encodeURIComponent(key));
    }
  }
  keys.sort();
  for (const key of keys) {
    sorted[key] = encodeURIComponent(params[key]).replace(/%20/g, '+');
  }
  return sorted;
}

export function serializeVnpayParams(
  params: Readonly<Record<string, string>>,
): string {
  return qs.stringify(sortVnpayParams(params), { encode: false });
}

@Injectable()
export class VnpayService {
  constructor(private readonly config: ConfigService) {}

  buildPaymentUrl(input: VnpayPaymentInput): {
    paymentUrl: string;
    sanitizedRequest: Record<string, string>;
  } {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new Error('Số tiền VNPAY không hợp lệ.');
    }
    const merchantTxnRef = requireVnpayTxnRef(input.merchantTxnRef);
    const params: Record<string, string> = {
      vnp_Version: this.config.getOrThrow<string>('payment.vnpay.version'),
      vnp_Command: this.config.getOrThrow<string>('payment.vnpay.command'),
      vnp_TmnCode: this.config.getOrThrow<string>('payment.vnpay.tmnCode'),
      vnp_Amount: String(input.amount * 100),
      vnp_CreateDate: this.formatVietnamTime(input.createdAt),
      vnp_CurrCode: this.config.getOrThrow<string>('payment.vnpay.currency'),
      vnp_IpAddr: input.ipAddress,
      vnp_Locale: this.config.getOrThrow<string>('payment.vnpay.locale'),
      vnp_OrderInfo: `Thanh toan don hang ${input.orderCode}`,
      vnp_OrderType: this.config.getOrThrow<string>('payment.vnpay.orderType'),
      vnp_ReturnUrl: this.config.getOrThrow<string>('payment.vnpay.returnUrl'),
      vnp_ExpireDate: this.formatVietnamTime(input.expiresAt),
      vnp_TxnRef: merchantTxnRef,
    };
    const sortedParams = sortVnpayParams(params);
    const signData = qs.stringify(sortedParams, { encode: false });
    const signed = createHmac(
      'sha512',
      this.config.getOrThrow<string>('payment.vnpay.hashSecret'),
    )
      .update(Buffer.from(signData, 'utf8'))
      .digest('hex');
    sortedParams.vnp_SecureHash = signed;

    let paymentUrl = this.config.getOrThrow<string>('payment.vnpay.paymentUrl');
    paymentUrl += `?${qs.stringify(sortedParams, { encode: false })}`;
    return { paymentUrl, sanitizedRequest: params };
  }

  verify(query: Readonly<Record<string, unknown>>): boolean {
    const secureHash =
      typeof query.vnp_SecureHash === 'string' ? query.vnp_SecureHash : '';
    if (!/^[a-fA-F0-9]{128}$/.test(secureHash)) return false;
    const params = Object.fromEntries(
      Object.entries(query).flatMap(([key, value]) => {
        if (
          !key.startsWith('vnp_') ||
          key === 'vnp_SecureHash' ||
          key === 'vnp_SecureHashType' ||
          typeof value !== 'string' ||
          value.length === 0
        ) {
          return [];
        }
        return [[key, value]];
      }),
    );
    const expected = Buffer.from(
      this.sign(serializeVnpayParams(params)),
      'hex',
    );
    const received = Buffer.from(secureHash, 'hex');
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  sanitizeCallback(
    query: Readonly<Record<string, unknown>>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(query).flatMap(([key, value]) =>
        key.startsWith('vnp_') &&
        key !== 'vnp_SecureHash' &&
        key !== 'vnp_SecureHashType' &&
        typeof value === 'string'
          ? [[key, value]]
          : [],
      ),
    );
  }

  frontendResultUrl(
    paymentId: string,
    returnResult: VnpayReturnResult,
  ): string {
    const url = new URL(
      this.config.getOrThrow<string>('payment.vnpay.frontendResultUrl'),
    );
    url.searchParams.set('paymentId', paymentId);
    url.searchParams.set('returnResult', returnResult);
    return url.toString();
  }

  async queryTransaction(
    input: VnpayQueryInput,
  ): Promise<Record<string, unknown>> {
    const now = new Date();
    const requestId = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
    const params: Record<string, string> = {
      vnp_RequestId: requestId,
      vnp_Version: this.config.getOrThrow<string>('payment.vnpay.version'),
      vnp_Command: 'querydr',
      vnp_TmnCode: this.config.getOrThrow<string>('payment.vnpay.tmnCode'),
      vnp_TxnRef: requireVnpayTxnRef(input.merchantTxnRef),
      vnp_OrderInfo: sanitizeVnpayOrderInfo(
        `Tra cuu giao dich ${input.merchantTxnRef}`,
      ),
      vnp_TransactionDate: this.formatVietnamTime(input.transactionCreatedAt),
      vnp_CreateDate: this.formatVietnamTime(now),
      vnp_IpAddr: normalizeVnpayIpAddress(input.ipAddress),
    };
    const hashData = [
      params.vnp_RequestId,
      params.vnp_Version,
      params.vnp_Command,
      params.vnp_TmnCode,
      params.vnp_TxnRef,
      params.vnp_TransactionDate,
      params.vnp_CreateDate,
      params.vnp_IpAddr,
      params.vnp_OrderInfo,
    ].join('|');
    const response = await fetch(
      this.config.getOrThrow<string>('payment.vnpay.queryUrl'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          vnp_SecureHash: this.sign(hashData),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      throw new Error(`VNPAY QueryDR HTTP ${response.status}`);
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('VNPAY QueryDR response không hợp lệ.');
    }
    return Object.fromEntries(
      Object.entries(payload).filter(
        ([key]) => key !== 'vnp_SecureHash' && key !== 'vnp_HashSecret',
      ),
    );
  }

  private sign(value: string): string {
    return createHmac(
      'sha512',
      this.config.getOrThrow<string>('payment.vnpay.hashSecret'),
    )
      .update(value, 'utf8')
      .digest('hex');
  }

  private formatVietnamTime(value: Date): string {
    const vietnam = new Date(value.getTime() + 7 * 60 * 60 * 1000);
    return [
      vietnam.getUTCFullYear(),
      String(vietnam.getUTCMonth() + 1).padStart(2, '0'),
      String(vietnam.getUTCDate()).padStart(2, '0'),
      String(vietnam.getUTCHours()).padStart(2, '0'),
      String(vietnam.getUTCMinutes()).padStart(2, '0'),
      String(vietnam.getUTCSeconds()).padStart(2, '0'),
    ].join('');
  }
}
