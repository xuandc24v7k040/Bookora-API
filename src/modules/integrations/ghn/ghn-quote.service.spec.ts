import { ConfigService } from '@nestjs/config';
import { GhnClient } from './ghn.client';
import { GhnAddressResolver } from './ghn-address.resolver';
import { GhnQuoteService, ghnDeliveryDate } from './ghn-quote.service';
import type { GhnPreviewPayload, GhnQuoteContext } from './ghn.types';

const context: GhnQuoteContext = {
  userId: 'qa-principal',
  cartId: 'qa-cart',
  branchId: 'qa-branch',
  origin: {
    address: 'QA street A',
    province: 'Cần Thơ',
    ward: 'Phường Ninh Kiều',
  },
  destination: {
    address: 'QA street B',
    province: 'Hồ Chí Minh',
    ward: 'Phường Sài Gòn',
  },
  receiverName: 'QA',
  receiverPhone: '0900000001',
  items: [
    {
      variantId: 'qa-variant',
      quantity: 1,
      unitPrice: 120000,
      weightGram: 350,
    },
  ],
  subtotal: 120000,
  paymentMethod: 'COD',
  packaging: { packagingType: 'SINGLE_BOOK_BAG', grossWeightGram: 450 },
};
function setup() {
  const preview = jest.fn().mockResolvedValue({
    shippingFee: 31501,
    estimatedDeliveryAt: '2026-11-27T17:00:00.000Z',
    feeComponents: { main_service: 31501 },
  });
  const settings = jest.fn().mockReturnValue({
    enabled: true,
    valid: true,
    timeoutMs: 5000,
    scope: 'account-scope',
  });
  const client = { preview, settings } as unknown as GhnClient;
  const resolve = jest
    .fn()
    .mockImplementation((address: unknown) => Promise.resolve(address));
  const resolver = { resolve } as unknown as GhnAddressResolver;
  const service = new GhnQuoteService(
    client,
    resolver,
    new ConfigService({
      shipping: { locationProof: { secret: 'unit-test-reference-secret' } },
    }),
  );
  return { service, preview, settings, resolve };
}
describe('GHN scoped quote and canonical COD convergence', () => {
  afterEach(() => jest.useRealTimers());
  it('uses gross grams and explicit two-level branch addresses, converging to actual COD total', async () => {
    const { service, preview } = setup();
    const result = await service.quote(
      context,
      (fee) => Promise.resolve(120000 + fee),
      120000,
    );
    expect(preview).toHaveBeenCalledTimes(2);
    const calls = preview.mock.calls as [GhnPreviewPayload, AbortSignal][];
    expect(calls.map(([body]) => body.cod_amount)).toEqual([120000, 151501]);
    expect(calls[1][0]).toMatchObject({
      weight: 450,
      from_address: 'QA street A',
      from_province_name: 'Cần Thơ',
      is_new_from_address: true,
      is_new_to_address: true,
      insurance_value: 120000,
      order_value: 120000,
      payment_type_id: 1,
    });
    expect(calls[1][0]).not.toHaveProperty('from_district_id');
    expect(calls[1][0]).not.toHaveProperty('latitude');
    expect(result.codAmount).toBe(151501);
  });
  it('deduplicates concurrent requests and reuses valid fee inputs across toggles', async () => {
    const { service, preview } = setup();
    const price = (fee: number) => Promise.resolve(120000 + fee);
    const [first, second] = await Promise.all([
      service.quote(context, price, 32000),
      service.quote(context, price, 32000),
    ]);
    const later = await service.quote(
      context,
      price,
      32000,
      first.quoteReference,
    );
    expect(preview).toHaveBeenCalledTimes(2);
    expect(first.materialFingerprint).toBe(second.materialFingerprint);
    expect(later.materialFingerprint).toBe(first.materialFingerprint);
  });
  it('rejects foreign principal, branch/address changes, and tampered reference', async () => {
    const { service } = setup();
    const quote = await service.quote(
      context,
      (fee) => Promise.resolve(120000 + fee),
      32000,
    );
    for (const changed of [
      { ...context, userId: 'foreign' },
      { ...context, branchId: 'other' },
      { ...context, origin: { ...context.origin, address: 'New origin' } },
    ]) {
      await expect(
        service.quote(
          changed,
          (fee) => Promise.resolve(120000 + fee),
          32000,
          quote.quoteReference,
        ),
      ).rejects.toMatchObject({ errorCode: 'SHIPPING_QUOTE_CONTEXT_MISMATCH' });
    }
    await expect(
      service.quote(
        context,
        (fee) => Promise.resolve(fee),
        32000,
        quote.quoteReference + 'tamper',
      ),
    ).rejects.toMatchObject({ errorCode: 'SHIPPING_QUOTE_CONTEXT_MISMATCH' });
  });
  it('refreshes expired cache, changes material fingerprint for a fee or VN delivery-date change', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-26T00:00:00Z') });
    const { service, preview } = setup();
    const input = { ...context, paymentMethod: 'VNPAY' as const };
    const first = await service.quote(
      input,
      (fee) => Promise.resolve(fee),
      32000,
    );
    jest.advanceTimersByTime(61000);
    preview.mockResolvedValue({
      shippingFee: 32001,
      estimatedDeliveryAt: '2026-11-28T17:00:00.000Z',
      feeComponents: { main_service: 32001 },
    });
    const second = await service.quote(
      input,
      (fee) => Promise.resolve(fee),
      32000,
      first.quoteReference,
    );
    expect(preview).toHaveBeenCalledTimes(2);
    expect(second.materialFingerprint).not.toBe(first.materialFingerprint);
  });
  it('does not reuse a failed response or stale expired result', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-26T00:00:00Z') });
    const { service, preview } = setup();
    const input = { ...context, paymentMethod: 'VNPAY' as const };
    await service.quote(input, (fee) => Promise.resolve(fee), 32000);
    jest.advanceTimersByTime(61000);
    preview.mockRejectedValueOnce(new Error('controlled upstream outage'));
    await expect(
      service.quote(input, (fee) => Promise.resolve(fee), 32000),
    ).rejects.toThrow();
    await expect(
      service.quote(input, (fee) => Promise.resolve(fee), 32000),
    ).resolves.toMatchObject({ shippingFee: 31501 });
  });
  it('bounds nonconverging COD computation without accepting a mismatched amount', async () => {
    const { service, preview } = setup();
    let value = 1;
    await expect(
      service.quote(context, () => Promise.resolve(value++), 32000),
    ).rejects.toMatchObject({ errorCode: 'GHN_UNAVAILABLE' });
    expect(preview).toHaveBeenCalledTimes(3);
  });
  it('prepaid uses zero COD and rejects unsupported parcels rather than clamping', async () => {
    const { service, preview } = setup();
    await service.quote(
      { ...context, paymentMethod: 'VNPAY' },
      (fee) => Promise.resolve(fee),
      32000,
    );
    expect((preview.mock.calls[0]![0] as GhnPreviewPayload).cod_amount).toBe(0);
    await expect(
      service.quote(
        {
          ...context,
          packaging: { ...context.packaging, grossWeightGram: 20000 },
        },
        (fee) => Promise.resolve(fee),
        32000,
      ),
    ).rejects.toMatchObject({ errorCode: 'GHN_PARCEL_UNSUPPORTED' });
  });
  it('disabled or invalid configuration causes zero upstream calls', async () => {
    const { service, preview, settings, resolve } = setup();
    for (const config of [
      { enabled: false },
      { enabled: true, valid: false },
    ]) {
      settings.mockReturnValue(config);
      await expect(
        service.quote(context, (fee) => Promise.resolve(fee), 32000),
      ).rejects.toMatchObject({ errorCode: 'GHN_UNAVAILABLE' });
    }
    expect(preview).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });
  it('uses Vietnam date boundaries', () => {
    expect(ghnDeliveryDate('2026-11-27T16:59:59Z')).toBe('2026-11-27');
    expect(ghnDeliveryDate('2026-11-27T17:00:00Z')).toBe('2026-11-28');
  });
});
