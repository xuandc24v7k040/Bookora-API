import { ConfigService } from '@nestjs/config';
import { GhnClient } from './ghn.client';
import type { GhnPreviewPayload } from './ghn.types';

describe('GHN wire safety and runtime response validation', () => {
  const originalFetch = globalThis.fetch;
  const payload: GhnPreviewPayload = {
    from_address: 'QA origin',
    from_province_name: 'Cần Thơ',
    from_ward_name: 'Phường Ninh Kiều',
    is_new_from_address: true,
    to_address: 'QA destination',
    to_province_name: 'Hồ Chí Minh',
    to_ward_name: 'Phường Sài Gòn',
    is_new_to_address: true,
    to_name: 'QA',
    to_phone: '0900000001',
    weight: 450,
    length: 28,
    width: 20,
    height: 5,
    service_type_id: 2,
    payment_type_id: 1,
    required_note: 'KHONGCHOXEMHANG',
    content: 'QA books',
    cod_amount: 151501,
    insurance_value: 120000,
    order_value: 120000,
  };
  const client = new GhnClient(
    new ConfigService({
      ghn: {
        enabled: true,
        valid: true,
        baseUrl: 'https://online-gateway.ghn.vn',
        token: 'unit-token',
        shopId: '123',
        timeoutMs: 100,
        scope: 'qa',
      },
    }),
  );
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  it.each([
    { code: 200, data: null },
    { code: 400, data: { total_fee: 0 } },
    {
      code: 200,
      data: {
        order_code: 'MUST-REJECT',
        total_fee: 1,
        expected_delivery_time: '2026-11-28T00:00:00Z',
        fee: {},
      },
    },
    {
      code: 200,
      data: {
        order_code: '',
        total_fee: -1,
        expected_delivery_time: '2026-11-28T00:00:00Z',
        fee: {},
      },
    },
    {
      code: 200,
      data: {
        order_code: '',
        total_fee: 1.5,
        expected_delivery_time: 'invalid',
        fee: {},
      },
    },
  ])(
    'rejects malformed/error success body without fee=0 fallback: %p',
    async (body) => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
      await expect(
        client.preview(payload, AbortSignal.timeout(100)),
      ).rejects.toMatchObject({ errorCode: 'GHN_UNAVAILABLE' });
    },
  );
  it('accepts a real zero-fee quote only when all mandatory fields validate', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            order_code: '',
            total_fee: 0,
            expected_delivery_time: '2026-11-28T00:00:00Z',
            fee: { main_service: 0 },
          },
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock;
    await expect(
      client.preview(payload, AbortSignal.timeout(100)),
    ).resolves.toMatchObject({ shippingFee: 0 });
    expect(fetchMock.mock.calls[0]![0].pathname).toBe(
      '/shiip/public-api/v2/shipping-order/preview',
    );
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: 'error' });
  });
  it('rejects missing explicit FROM before network; no shop fallback', async () => {
    globalThis.fetch = jest.fn();
    await expect(
      client.preview(
        { ...payload, from_address: '' },
        AbortSignal.timeout(100),
      ),
    ).rejects.toMatchObject({ errorCode: 'GHN_ADDRESS_UNRESOLVED' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('maps provider value and route errors without leaking raw bodies', async () => {
    for (const [code, expected] of [
      ['COD_IS_OVER_LIMIT', 'GHN_VALUE_UNSUPPORTED'],
      ['FROM_ADDRESS_CONFLICT', 'GHN_ADDRESS_UNRESOLVED'],
      ['ROUTE_NOT_FOUND_SERVICE', 'GHN_ROUTE_UNSUPPORTED'],
    ]) {
      globalThis.fetch = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 400,
            data: null,
            code_message: code,
            message: 'sensitive QA body must stay private',
          }),
          { status: 400 },
        ),
      );
      await expect(
        client.preview(payload, AbortSignal.timeout(100)),
      ).rejects.toMatchObject({ errorCode: expected });
    }
  });
  it('rejects ward data:null and parent mismatch', async () => {
    for (const data of [
      null,
      [
        {
          _id: 1,
          name: 'Phường QA',
          extension_names: [],
          parent_id: 999,
          status: 1,
        },
      ],
    ]) {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: 200, data }), { status: 200 }),
        );
      await expect(
        client.masterData(123, AbortSignal.timeout(100)),
      ).rejects.toMatchObject({ errorCode: 'GHN_ADDRESS_UNRESOLVED' });
    }
  });
});
