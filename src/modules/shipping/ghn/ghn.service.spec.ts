import {
  BadGatewayException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhnService } from './ghn.service';

describe('GhnService', () => {
  const configValues: Record<string, unknown> = {
    'shipping.ghn.baseUrl':
      'https://dev-online-gateway.ghn.vn/shiip/public-api',
    'shipping.ghn.token': 'test-token',
    'shipping.ghn.shopId': 123,
    'shipping.ghn.timeoutMs': 1_000,
    'shipping.ghn.defaultItemWeightGrams': 500,
    'shipping.ghn.defaultPackageLengthCm': 20,
    'shipping.ghn.defaultPackageWidthCm': 15,
    'shipping.ghn.defaultPackageHeightCm': 5,
  };
  const config = {
    getOrThrow: jest.fn((key: string) => configValues[key]),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function response(data: unknown): Response {
    return {
      ok: true,
      json: () => Promise.resolve({ code: 200, message: 'Success', data }),
    } as Response;
  }

  it('resolves Province -> District -> Ward with normalized extensions', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response([
          {
            ProvinceID: 220,
            ProvinceName: 'Cần Thơ',
            NameExtension: ['Thành phố Cần Thơ'],
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            DistrictID: 1572,
            DistrictName: 'Ninh Kiều',
            NameExtension: ['Quận Ninh Kiều'],
            Status: 1,
            SupportType: 3,
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            WardCode: '550307',
            WardName: 'Xuân Khánh',
            NameExtension: ['Phường Xuân Khánh'],
            Status: 1,
            SupportType: 2,
          },
        ]),
      );

    await expect(
      new GhnService(config).resolveAddressExact(
        'Thành phố Cần Thơ',
        'Phường Xuân Khánh',
        'Quận Ninh Kiều',
      ),
    ).resolves.toMatchObject({
      provinceId: 220,
      districtId: 1572,
      wardCode: '550307',
    });

    const districtRequestBody = fetchMock.mock.calls[1]?.[1]?.body;
    const wardRequestBody = fetchMock.mock.calls[2]?.[1]?.body;
    expect(typeof districtRequestBody).toBe('string');
    expect(typeof wardRequestBody).toBe('string');
    const districtBody = JSON.parse(districtRequestBody as string) as {
      province_id: number;
    };
    const wardBody = JSON.parse(wardRequestBody as string) as {
      district_id: number;
    };
    expect(districtBody.province_id).toBe(220);
    expect(wardBody.district_id).toBe(1572);
  });

  it('validates the full active hierarchy for Checkout legacy mapping', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response([
          {
            ProvinceID: 220,
            ProvinceName: 'Cần Thơ',
            NameExtension: ['Thành phố Cần Thơ'],
            Status: 1,
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            DistrictID: 1572,
            DistrictName: 'Ninh Kiều',
            NameExtension: ['Quận Ninh Kiều'],
            Status: 1,
            SupportType: 3,
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            WardCode: '550307',
            WardName: 'Xuân Khánh',
            NameExtension: ['Phường Xuân Khánh'],
            Status: 1,
            SupportType: 2,
          },
        ]),
      );

    await expect(
      new GhnService(config).resolveCheckoutAddressExact(
        'Thành phố Cần Thơ',
        'Quận Ninh Kiều',
        'Phường Xuân Khánh',
      ),
    ).resolves.toMatchObject({
      provinceId: 220,
      districtId: 1572,
      wardCode: '550307',
    });
  });

  it('returns a 422 mapping error instead of a gateway error when names do not map', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response([{ ProvinceID: 220, ProvinceName: 'Cần Thơ' }]),
      )
      .mockResolvedValueOnce(response([]));

    const promise = new GhnService(config).resolveAddressExact(
      'Cần Thơ',
      'Phường Ninh Kiều',
      'Quận Ninh Kiều',
    );
    await expect(promise).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'GHN_ADDRESS_MAPPING_INVALID',
      }),
    });
  });

  it('rejects receiver units without GHN delivery support', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response([{ ProvinceID: 220, ProvinceName: 'Cần Thơ' }]),
      )
      .mockResolvedValueOnce(
        response([
          {
            DistrictID: 1572,
            DistrictName: 'Ninh Kiều',
            Status: 1,
            SupportType: 1,
          },
        ]),
      )
      .mockResolvedValueOnce(
        response([
          {
            WardCode: '550307',
            WardName: 'Xuân Khánh',
            Status: 1,
            SupportType: 2,
          },
        ]),
      );

    await expect(
      new GhnService(config).resolveAddressExact(
        'Cần Thơ',
        'Xuân Khánh',
        'Ninh Kiều',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'GHN_ADDRESS_UNSUPPORTED' }),
    });
  });

  it('keeps upstream failures as 502 provider errors', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

    const promise = new GhnService(config).resolveAddressExact(
      'Cần Thơ',
      'Xuân Khánh',
      'Ninh Kiều',
    );
    await expect(promise).rejects.toBeInstanceOf(BadGatewayException);
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'GHN_PROVIDER_UNAVAILABLE' }),
    });
  });

  it('quotes a deterministic multi-item package without zero fallback', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 200,
            message: 'Success',
            data: [
              {
                service_id: 53320,
                short_name: 'Hàng nhẹ',
                service_type_id: 2,
              },
            ],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 200,
            message: 'Success',
            data: {
              total: 25_000,
              service_fee: 22_000,
              insurance_fee: 3_000,
              cod_fee: 0,
            },
          }),
      } as Response);
    const result = await new GhnService(config).quote({
      fromDistrictId: 1444,
      fromWardCode: '13010',
      toDistrictId: 1452,
      toWardCode: '21012',
      subtotal: 495_000,
      codValue: 520_000,
      items: [
        {
          name: 'Đắc Nhân Tâm',
          code: 'BOOK-1',
          quantity: 3,
        },
        {
          name: 'Nhà Giả Kim',
          code: 'BOOK-2',
          quantity: 2,
        },
      ],
    });
    expect(result.shippingFee).toBe(25_000);
    const feeRequest = fetchMock.mock.calls[1];
    const requestBody = feeRequest?.[1]?.body;
    expect(typeof requestBody).toBe('string');
    const body = JSON.parse(requestBody as string) as {
      weight: number;
      length: number;
      width: number;
      height: number;
      items: unknown[];
    };
    expect(body).toMatchObject({
      from_district_id: 1444,
      from_ward_code: '13010',
      to_district_id: 1452,
      to_ward_code: '21012',
      weight: 2_500,
      length: 20,
      width: 15,
      height: 25,
    });
    expect(body.items).toHaveLength(2);
  });
});
