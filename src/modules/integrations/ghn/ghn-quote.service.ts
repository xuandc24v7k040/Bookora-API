import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { GhnClient } from './ghn.client';
import { GhnAddressResolver } from './ghn-address.resolver';
import { GhnQuoteError } from './ghn.error';
import { ensureCatalogFitsParcel } from './ghn-parcel';
import type {
  GhnPreviewPayload,
  GhnPreviewResult,
  GhnQuote,
  GhnQuoteContext,
} from './ghn.types';

// Estimates for Bookora's existing package kinds; physical sizes must be validated operationally.
const DIMENSIONS = {
  SINGLE_BOOK_BAG: [28, 20, 5],
  SMALL_BOOK_BOX: [28, 22, 12],
  MEDIUM_BOOK_BOX: [30, 24, 20],
  LARGE_BOOK_BOX: [35, 27, 28],
  BULK_BOOK_BOX: [40, 30, 35],
} as const;
const TTL_MS = 60000;
const MAX_ENTRIES = 256;
interface CachedPreview {
  result: GhnPreviewResult;
  quotedAt: number;
  expiresAt: number;
}
interface ReferencePayload {
  version: 1;
  context: string;
  material: string;
  expiresAt: number;
  nonce: string;
}
function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function ghnDeliveryDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

@Injectable()
export class GhnQuoteService {
  private readonly cache = new Map<string, CachedPreview>();
  private readonly flights = new Map<string, Promise<CachedPreview>>();
  constructor(
    private readonly client: GhnClient,
    private readonly addresses: GhnAddressResolver,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return this.client.settings().enabled;
  }

  async quote(
    context: GhnQuoteContext,
    calculateTotal: (fee: number) => Promise<number>,
    initialCodAmount: number,
    reference?: string,
  ): Promise<GhnQuote> {
    const settings = this.client.settings();
    if (!settings.enabled || !settings.valid)
      throw new GhnQuoteError('GHN_UNAVAILABLE');
    const signal = AbortSignal.timeout(settings.timeoutMs); // One total budget, including master data and COD convergence.
    const origin = await this.addresses.resolve(context.origin, signal);
    const destination = await this.addresses.resolve(
      context.destination,
      signal,
    );
    const contextFingerprint = fingerprint({
      ...context,
      origin,
      destination,
      items: [...context.items].sort((a, b) =>
        a.variantId.localeCompare(b.variantId),
      ),
      account: settings.scope,
    });
    if (reference) this.verifyReference(reference, contextFingerprint);
    const dimensions = DIMENSIONS[context.packaging.packagingType];
    if (
      !dimensions ||
      !Number.isSafeInteger(context.packaging.grossWeightGram) ||
      context.packaging.grossWeightGram <= 0 ||
      context.packaging.grossWeightGram >= 20000
    )
      throw new GhnQuoteError('GHN_PARCEL_UNSUPPORTED');
    if (
      !Number.isSafeInteger(context.subtotal) ||
      context.subtotal < 0 ||
      context.subtotal > 5000000
    )
      throw new GhnQuoteError('GHN_VALUE_UNSUPPORTED');
    const [length, width, height] = dimensions;
    ensureCatalogFitsParcel(dimensions, context.items);
    // Start from canonical net merchandise, not INTERNAL's fee: a higher internal fee
    // must not falsely trip the carrier COD limit before its own fee is known.
    let cod = context.paymentMethod === 'COD' ? initialCodAmount : 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!Number.isSafeInteger(cod) || cod < 0 || cod > 50000000)
        throw new GhnQuoteError('GHN_VALUE_UNSUPPORTED');
      const payload: GhnPreviewPayload = {
        from_address: origin.address,
        from_province_name: origin.province,
        from_ward_name: origin.ward,
        is_new_from_address: true,
        to_name: context.receiverName,
        to_phone: context.receiverPhone,
        to_address: destination.address,
        to_province_name: destination.province,
        to_ward_name: destination.ward,
        is_new_to_address: true,
        weight: context.packaging.grossWeightGram,
        length,
        width,
        height,
        service_type_id: 2,
        payment_type_id: 1,
        required_note: 'KHONGCHOXEMHANG',
        content: 'Sách Bookora',
        cod_amount: cod,
        insurance_value: context.subtotal,
        order_value: context.subtotal,
      };
      const entry = await this.preview(
        fingerprint([
          settings.scope,
          context.userId,
          context.branchId,
          payload,
        ]),
        payload,
        signal,
      );
      const nextCod =
        context.paymentMethod === 'COD'
          ? await calculateTotal(entry.result.shippingFee)
          : 0;
      if (nextCod === cod) {
        const materialFingerprint = fingerprint({
          contextFingerprint,
          fee: entry.result.shippingFee,
          deliveryDate: ghnDeliveryDate(entry.result.estimatedDeliveryAt),
          parcel: [payload.weight, length, width, height],
          service: 2,
          cod,
          declaredValue: context.subtotal,
        });
        const quoteReference = this.signReference({
          version: 1,
          context: contextFingerprint,
          material: materialFingerprint,
          expiresAt: entry.expiresAt,
          nonce: randomUUID(),
        });
        return {
          provider: 'GHN',
          ...entry.result,
          quoteReference,
          materialFingerprint,
          contextFingerprint,
          quotedAt: new Date(entry.quotedAt).toISOString(),
          expiresAt: new Date(entry.expiresAt).toISOString(),
          serviceTypeId: 2,
          parcel: { weightGram: payload.weight, length, width, height },
          codAmount: cod,
          declaredValue: context.subtotal,
        };
      }
      cod = nextCod;
    }
    throw new GhnQuoteError('GHN_UNAVAILABLE'); // Never accept a fee/total pair that failed to converge.
  }

  private async preview(
    key: string,
    payload: GhnPreviewPayload,
    signal: AbortSignal,
  ): Promise<CachedPreview> {
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached;
    this.cache.delete(key);
    const pending = this.flights.get(key);
    if (pending) return pending;
    if (this.flights.size >= MAX_ENTRIES)
      throw new GhnQuoteError('GHN_UNAVAILABLE');
    const flight = this.client
      .preview(payload, signal)
      .then((result) => {
        const entry = {
          result,
          quotedAt: Date.now(),
          expiresAt: Date.now() + TTL_MS,
        };
        for (const [cacheKey, value] of this.cache)
          if (value.expiresAt <= Date.now()) this.cache.delete(cacheKey);
        if (this.cache.size >= MAX_ENTRIES)
          this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, entry);
        return entry;
      })
      .finally(() => this.flights.delete(key));
    this.flights.set(key, flight);
    return flight;
  }

  private signReference(payload: ReferencePayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac(
      'sha256',
      this.config.getOrThrow<string>('shipping.locationProof.secret'),
    )
      .update(`ghn-quote-v1.${body}`)
      .digest('base64url');
    return `${body}.${signature}`;
  }

  private verifyReference(reference: string, context: string): void {
    try {
      const parts = reference.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1])
        throw new Error('invalid');
      const expected = this.signReference(
        JSON.parse(
          Buffer.from(parts[0], 'base64url').toString('utf8'),
        ) as ReferencePayload,
      ).split('.')[1];
      const left = Buffer.from(parts[1], 'base64url'),
        right = Buffer.from(expected, 'base64url');
      if (left.length !== right.length || !timingSafeEqual(left, right))
        throw new Error('invalid');
      const payload = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString('utf8'),
      ) as Partial<ReferencePayload>;
      if (
        payload.version !== 1 ||
        payload.context !== context ||
        typeof payload.material !== 'string' ||
        !Number.isSafeInteger(payload.expiresAt)
      )
        throw new Error('invalid');
      // Expired authentic references may refresh. The canonical preview hash compares material price/ETA date before placement.
    } catch {
      throw new GhnQuoteError('SHIPPING_QUOTE_CONTEXT_MISMATCH');
    }
  }
}
