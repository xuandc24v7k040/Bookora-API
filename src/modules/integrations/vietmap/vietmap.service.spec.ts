import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VietMapService } from './vietmap.service';

describe('VietMapService', () => {
  const originalKey = process.env.VIETMAP_SERVICE_KEY;
  const originalBaseUrl = process.env.VIETMAP_API_BASE_URL;
  const fetchMock = jest.fn();
  let service: VietMapService;

  beforeEach(() => {
    process.env.VIETMAP_SERVICE_KEY = 'service-secret';
    process.env.VIETMAP_API_BASE_URL = 'https://maps.vietmap.vn/api';
    global.fetch = fetchMock as typeof fetch;
    fetchMock.mockReset();
    service = new VietMapService({
      get: (key: string) =>
        key === 'VIETMAP_SERVICE_KEY'
          ? 'service-secret'
          : 'https://maps.vietmap.vn/api',
    } as ConfigService);
  });

  afterAll(() => {
    process.env.VIETMAP_SERVICE_KEY = originalKey;
    process.env.VIETMAP_API_BASE_URL = originalBaseUrl;
  });

  it('keeps Branch reverse geocoding on the current v2 hierarchy', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: 10.1,
            lng: 105.2,
            name: '12 Đường 30 tháng 4',
            display: '12 Đường 30 tháng 4, Phường Ninh Kiều, Thành phố Cần Thơ',
            boundaries: [
              { type: 2, full_name: 'Phường Xuân Khánh' },
              { type: 1, full_name: 'Quận Ninh Kiều' },
              { type: 0, full_name: 'Thành phố Cần Thơ' },
            ],
          },
        ]),
    });

    await expect(
      service.reverse({ latitude: 10.1, longitude: 105.2 }),
    ).resolves.toEqual({
      latitude: 10.1,
      longitude: 105.2,
      countryCode: null,
      province: 'Thành phố Cần Thơ',
      district: 'Quận Ninh Kiều',
      ward: 'Phường Xuân Khánh',
      address: '12 Đường 30 tháng 4',
      displayAddress:
        '12 Đường 30 tháng 4, Phường Ninh Kiều, Thành phố Cần Thơ',
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe('/api/reverse/v4');
    expect(requestedUrl.searchParams.get('display_type')).toBe('1');
    expect(requestedUrl.searchParams.get('apikey')).toBe('service-secret');
  });

  it('uses a separate legacy reverse adapter for shipping disambiguation', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: 9.6838,
            lng: 105.5695,
            country_code: 'vn',
            boundaries: [
              { type: 2, full_name: 'Phường Bình Thạnh' },
              { type: 1, full_name: 'Thị xã Long Mỹ' },
              { type: 0, full_name: 'Tỉnh Hậu Giang' },
            ],
          },
        ]),
    });

    await expect(
      service.reverseLegacy({ latitude: 9.6838, longitude: 105.5695 }),
    ).resolves.toMatchObject({
      countryCode: 'VN',
      province: 'Tỉnh Hậu Giang',
      district: 'Thị xã Long Mỹ',
      ward: 'Phường Bình Thạnh',
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.searchParams.get('display_type')).toBe('6');
  });

  it('uses display_type=5 and preserves top-level current plus data_old for Checkout', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            lat: 10.0452,
            lng: 105.7469,
            country_code: 'vn',
            ref_id: 'vm:checkout',
            name: 'Hẻm tổ 7',
            display: 'Hẻm tổ 7, Phường Ninh Kiều, Thành phố Cần Thơ',
            boundaries: [
              { type: 2, id: 31135, full_name: 'Phường Ninh Kiều' },
              { type: 0, id: 92, full_name: 'Thành phố Cần Thơ' },
            ],
            data_old: {
              boundaries: [
                { type: 2, full_name: 'Phường Xuân Khánh' },
                { type: 1, full_name: 'Quận Ninh Kiều' },
                { type: 0, full_name: 'Thành phố Cần Thơ' },
              ],
            },
          },
        ]),
    });

    const first = await service.reverseHybridForCheckoutShipping(
      10.0452,
      105.7469,
    );
    const second = await service.reverseHybridForCheckoutShipping(
      10.0452,
      105.7469,
    );

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      current: {
        provinceName: 'Thành phố Cần Thơ',
        wardName: 'Phường Ninh Kiều',
      },
      legacy: {
        provinceName: 'Thành phố Cần Thơ',
        districtName: 'Quận Ninh Kiều',
        wardName: 'Phường Xuân Khánh',
      },
      provider: 'VIETMAP',
      placeId: 'vm:checkout',
      countryCode: 'VN',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe('/api/reverse/v4');
    expect(requestedUrl.searchParams.get('display_type')).toBe('5');
  });

  it('geocodes a full address with display_type=5 and resolves candidate coordinates', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              ref_id: 'geocode:checkout',
              country_code: 'VN',
              name: 'Hẻm tổ 7',
              display: 'Hẻm tổ 7, Phường Ninh Kiều, Thành phố Cần Thơ',
              boundaries: [
                { type: 2, id: 31135, full_name: 'Phường Ninh Kiều' },
                { type: 0, id: 92, full_name: 'Thành phố Cần Thơ' },
              ],
              data_old: {
                boundaries: [
                  { type: 2, full_name: 'Phường Xuân Khánh' },
                  { type: 1, full_name: 'Quận Ninh Kiều' },
                  { type: 0, full_name: 'Thành phố Cần Thơ' },
                ],
              },
            },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            lat: 10.0452,
            lng: 105.7469,
            country_code: 'VN',
          }),
      });

    const candidates = await service.geocodeHybridForCheckoutShipping(
      'Hẻm tổ 7, Phường Ninh Kiều, Thành phố Cần Thơ, Việt Nam',
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      current: { latitude: 10.0452, longitude: 105.7469 },
      legacy: { districtName: 'Quận Ninh Kiều' },
    });
    const geocodeUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const placeUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(geocodeUrl.pathname).toBe('/api/search/v4');
    expect(geocodeUrl.searchParams.get('display_type')).toBe('5');
    expect(placeUrl.pathname).toBe('/api/place/v4');
    expect(placeUrl.searchParams.get('refid')).toBe('geocode:checkout');
  });

  it('normalizes autocomplete without returning raw provider fields', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { ref_id: 'auto:opaque', display: 'Ninh Kiều, Cần Thơ', distance: 1 },
        ]),
    });

    await expect(
      service.autocomplete({
        text: 'Ninh Kiều',
        focusLatitude: 10,
        focusLongitude: 105,
      }),
    ).resolves.toEqual([
      { refId: 'auto:opaque', displayAddress: 'Ninh Kiều, Cần Thơ' },
    ]);
  });

  it('does not expose the service key when the provider fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    await expect(service.place('auto:opaque')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    await expect(service.place('auto:opaque')).rejects.not.toThrow(
      /service-secret/,
    );
  });
});
