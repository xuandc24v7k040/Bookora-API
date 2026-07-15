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
    service = new VietMapService({} as ConfigService);
  });

  afterAll(() => {
    process.env.VIETMAP_SERVICE_KEY = originalKey;
    process.env.VIETMAP_API_BASE_URL = originalBaseUrl;
  });

  it('normalizes reverse v4 to the two-level branch location model', async () => {
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
              { type: 2, full_name: 'Phường Ninh Kiều' },
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
      province: 'Thành phố Cần Thơ',
      ward: 'Phường Ninh Kiều',
      address: '12 Đường 30 tháng 4',
      displayAddress:
        '12 Đường 30 tháng 4, Phường Ninh Kiều, Thành phố Cần Thơ',
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe('/api/reverse/v4');
    expect(requestedUrl.searchParams.get('display_type')).toBe('1');
    expect(requestedUrl.searchParams.get('apikey')).toBe('service-secret');
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
