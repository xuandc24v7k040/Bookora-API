import {
  BadGatewayException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ShippingAddressCompatibilityService } from './shipping-address-compatibility.service';

function response(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response;
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

const candidates = [
  {
    code: 31123,
    name: 'Phường Thới Bình',
    codename: 'phuong_thoi_binh',
    division_type: 'phường',
    district_code: 916,
    province_code: 92,
  },
  {
    code: 31135,
    name: 'Phường Tân An',
    codename: 'phuong_tan_an',
    division_type: 'phường',
    district_code: 916,
    province_code: 92,
  },
];

describe('ShippingAddressCompatibilityService', () => {
  const ghn = { resolveAddressExact: jest.fn() };
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let service: ShippingAddressCompatibilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new ShippingAddressCompatibilityService(ghn as never);
  });

  function mockOfficialHierarchy(legacyCandidates = candidates): void {
    fetchMock.mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/v2/w/31135/to-legacies/')) {
        return Promise.resolve(response(legacyCandidates));
      }
      if (url.pathname.endsWith('/v1/w/31123')) {
        return Promise.resolve(
          response({
            code: 31123,
            name: 'Phường Thới Bình',
            codename: 'phuong_thoi_binh',
            division_type: 'phường',
            district_code: 916,
          }),
        );
      }
      if (url.pathname.endsWith('/v1/w/31135')) {
        return Promise.resolve(
          response({
            code: 31135,
            name: 'Phường Tân An',
            codename: 'phuong_tan_an',
            division_type: 'phường',
            district_code: 916,
          }),
        );
      }
      if (url.pathname.endsWith('/v1/d/916')) {
        return Promise.resolve(
          response({
            code: 916,
            name: 'Quận Ninh Kiều',
            province_code: 92,
          }),
        );
      }
      if (url.pathname.endsWith('/v1/p/92')) {
        return Promise.resolve(
          response({ code: 92, name: 'Thành phố Cần Thơ' }),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
  }

  it('deduplicates multiple legacy wards that map to one GHN tuple and caches the result', async () => {
    mockOfficialHierarchy();
    ghn.resolveAddressExact.mockResolvedValue({
      provinceId: 220,
      provinceName: 'Cần Thơ',
      districtId: 1572,
      districtName: 'Ninh Kiều',
      wardCode: '550307',
      wardName: 'Xuân Khánh',
      verifiedAt: new Date(),
    });

    const [first, concurrent] = await Promise.all([
      service.resolveNewAddress(92, 31135),
      service.resolveNewAddress(92, 31135),
    ]);
    const second = await service.resolveNewAddress(92, 31135);

    expect(first.mapping.wardCode).toBe('550307');
    expect(first.legacyCandidateCount).toBe(2);
    expect(concurrent).toBe(first);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(ghn.resolveAddressExact).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        requestUrl(input).pathname.includes('/to-legacies/'),
      ),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        requestUrl(input).pathname.includes('/v1/d/916'),
      ),
    ).toHaveLength(1);
  });

  it('never chooses the first candidate when mappings remain ambiguous', async () => {
    mockOfficialHierarchy();
    ghn.resolveAddressExact.mockImplementation(
      (_province: string, ward: string) =>
        Promise.resolve({
          provinceId: 220,
          provinceName: 'Cần Thơ',
          districtId: 1572,
          districtName: 'Ninh Kiều',
          wardCode: ward.includes('Thới Bình') ? '550301' : '550302',
          wardName: ward,
          verifiedAt: new Date(),
        }),
    );

    await expect(service.resolveNewAddress(92, 31135)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHECKOUT_ADDRESS_GHN_MAPPING_AMBIGUOUS',
      }),
    });
  });

  it('returns a dedicated code when v2 has no legacy candidate', async () => {
    fetchMock.mockResolvedValue(response([]));

    await expect(service.resolveNewAddress(92, 31135)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHECKOUT_ADDRESS_LEGACY_MAPPING_NOT_FOUND',
      }),
    });
    expect(ghn.resolveAddressExact.mock.calls).toHaveLength(0);
  });

  it('rejects an invalid legacy ward to district relation', async () => {
    mockOfficialHierarchy([candidates[0]]);
    fetchMock.mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/v2/w/31135/to-legacies/')) {
        return Promise.resolve(response([candidates[0]]));
      }
      if (url.pathname.endsWith('/v1/w/31123')) {
        return Promise.resolve(
          response({
            code: 31123,
            name: 'Phường Thới Bình',
            codename: 'phuong_thoi_binh',
            division_type: 'phường',
            district_code: 917,
          }),
        );
      }
      if (url.pathname.endsWith('/v1/d/916')) {
        return Promise.resolve(
          response({ code: 916, name: 'Ninh Kiều', province_code: 92 }),
        );
      }
      return Promise.resolve(response({ code: 92, name: 'Thành phố Cần Thơ' }));
    });

    await expect(service.resolveNewAddress(92, 31135)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHECKOUT_SAVED_ADDRESS_GHN_MAPPING_INVALID',
      }),
    });
  });

  it.each([
    ['malformed response', response({ data: [] })],
    ['provider failure', response({}, 503)],
  ])('maps %s to ADDRESS_PROVIDER_UNAVAILABLE', async (_name, provider) => {
    fetchMock.mockResolvedValue(provider);

    const promise = service.resolveNewAddress(92, 31135);
    await expect(promise).rejects.toBeInstanceOf(BadGatewayException);
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ADDRESS_PROVIDER_UNAVAILABLE',
      }),
    });
  });

  it('does not cache failed ambiguity as a successful mapping', async () => {
    mockOfficialHierarchy();
    ghn.resolveAddressExact.mockRejectedValue(
      new UnprocessableEntityException({
        code: 'GHN_ADDRESS_MAPPING_INVALID',
      }),
    );

    await expect(service.resolveNewAddress(92, 31135)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHECKOUT_SAVED_ADDRESS_GHN_MAPPING_INVALID',
      }),
    });
  });
});
