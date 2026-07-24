import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BoundedTtlCache } from '@/shared/cache/bounded-ttl-cache';
import type {
  VietMapAutocompleteQueryDto,
  VietMapLocationResponseDto,
  VietMapReverseQueryDto,
  VietMapSuggestionResponseDto,
} from './dto/vietmap.dto';

const VIETMAP_TIMEOUT_MS = 5_000;
const VIETMAP_UNAVAILABLE_MESSAGE =
  'Dịch vụ bản đồ tạm thời không khả dụng. Vui lòng thử lại sau.';

type JsonRecord = Record<string, unknown>;

export interface CheckoutHybridAddress {
  current: {
    formattedAddress: string;
    addressLine: string;
    provinceName: string;
    provinceCode?: number | null;
    wardName: string;
    wardCode?: number | null;
    latitude: number;
    longitude: number;
  };
  legacy: {
    provinceName: string;
    districtName: string;
    wardName: string;
  };
  provider: 'VIETMAP';
  placeId?: string | null;
  countryCode?: string | null;
}

const CHECKOUT_PROVIDER_CACHE_MS = 10 * 60 * 1_000;

@Injectable()
export class VietMapService {
  private readonly checkoutReverseCache =
    new BoundedTtlCache<CheckoutHybridAddress>(CHECKOUT_PROVIDER_CACHE_MS, 500);
  private readonly checkoutGeocodeCache = new BoundedTtlCache<
    CheckoutHybridAddress[]
  >(CHECKOUT_PROVIDER_CACHE_MS, 500);

  constructor(private readonly configService: ConfigService) {}

  async reverse(
    query: VietMapReverseQueryDto,
  ): Promise<VietMapLocationResponseDto> {
    return this.reverseWithDisplayType(query, '1');
  }

  async reverseLegacy(
    query: VietMapReverseQueryDto,
  ): Promise<VietMapLocationResponseDto> {
    return this.reverseWithDisplayType(query, '6');
  }

  reverseHybridForCheckoutShipping(
    latitude: number,
    longitude: number,
  ): Promise<CheckoutHybridAddress> {
    const key = `${latitude.toFixed(6)}|${longitude.toFixed(6)}`;
    return this.checkoutReverseCache.get(key, async () => {
      const payload = await this.checkoutRequest('reverse/v4', {
        lat: String(latitude),
        lng: String(longitude),
        display_type: '5',
      });
      const item = this.asRecordArray(payload)[0];
      if (!item) throw this.checkoutProviderUnavailable();
      return this.normalizeCheckoutHybrid(item, latitude, longitude);
    });
  }

  geocodeHybridForCheckoutShipping(
    fullAddress: string,
  ): Promise<CheckoutHybridAddress[]> {
    const text = fullAddress.trim();
    const key = text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('vi-VN');
    return this.checkoutGeocodeCache.get(key, async () => {
      const payload = await this.checkoutRequest('search/v4', {
        text,
        display_type: '5',
      });
      const items = this.asRecordArray(payload).slice(0, 10);
      return Promise.all(
        items.map(async (item) => {
          const reference = this.string(item.ref_id);
          const directLatitude = this.number(item.lat);
          const directLongitude = this.number(item.lng);
          if (directLatitude !== null && directLongitude !== null) {
            return this.normalizeCheckoutHybrid(
              item,
              directLatitude,
              directLongitude,
            );
          }
          if (!reference) throw this.checkoutProviderUnavailable();
          const place = await this.checkoutPlace(reference);
          return this.normalizeCheckoutHybrid(
            item,
            place.latitude,
            place.longitude,
            place.countryCode,
          );
        }),
      );
    });
  }

  private async reverseWithDisplayType(
    query: VietMapReverseQueryDto,
    displayType: '1' | '6',
  ): Promise<VietMapLocationResponseDto> {
    const payload = await this.request('reverse/v4', {
      lat: String(query.latitude),
      lng: String(query.longitude),
      display_type: displayType,
    });
    const first = this.asRecordArray(payload)[0];
    if (!first) throw this.malformedResponse();

    return this.normalizeBoundaryLocation(
      first,
      query.latitude,
      query.longitude,
    );
  }

  async autocomplete(
    query: VietMapAutocompleteQueryDto,
  ): Promise<VietMapSuggestionResponseDto[]> {
    const params: Record<string, string> = {
      text: query.text.trim(),
      display_type: '1',
    };
    if (
      query.focusLatitude !== undefined &&
      query.focusLongitude !== undefined
    ) {
      params.focus = `${query.focusLatitude},${query.focusLongitude}`;
    }

    const payload = await this.request('autocomplete/v4', params);
    return this.asRecordArray(payload).flatMap((item) => {
      const refId = this.string(item.ref_id);
      const displayAddress =
        this.string(item.display) || this.joinDisplay(item);
      return refId && displayAddress ? [{ refId, displayAddress }] : [];
    });
  }

  async place(refId: string): Promise<VietMapLocationResponseDto> {
    const payload = await this.request('place/v4', { refid: refId });
    const item = this.asRecord(payload);
    const latitude = this.number(item.lat);
    const longitude = this.number(item.lng);
    if (latitude === null || longitude === null) throw this.malformedResponse();

    return {
      latitude,
      longitude,
      countryCode: this.countryCode(item),
      province: this.nullableString(item.city),
      district: this.nullableString(item.district),
      ward: this.nullableString(item.ward),
      address:
        this.string(item.address) ||
        [this.string(item.hs_num), this.string(item.street)]
          .filter(Boolean)
          .join(' '),
      displayAddress:
        this.string(item.display) ||
        [
          this.string(item.address),
          this.string(item.ward),
          this.string(item.city),
        ]
          .filter(Boolean)
          .join(', '),
    };
  }

  private async request(
    path: string,
    params: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const serviceKey = process.env.VIETMAP_SERVICE_KEY?.trim();
    const baseUrl = (
      process.env.VIETMAP_API_BASE_URL || 'https://maps.vietmap.vn/api'
    ).trim();
    if (!serviceKey) {
      throw new ServiceUnavailableException(VIETMAP_UNAVAILABLE_MESSAGE);
    }

    let url: URL;
    try {
      url = new URL(`${baseUrl.replace(/\/$/, '')}/${path}`);
    } catch {
      throw new ServiceUnavailableException(VIETMAP_UNAVAILABLE_MESSAGE);
    }
    url.searchParams.set('apikey', serviceKey);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VIETMAP_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new BadGatewayException(VIETMAP_UNAVAILABLE_MESSAGE);
      return await response.json();
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException(VIETMAP_UNAVAILABLE_MESSAGE);
      }
      throw new BadGatewayException(VIETMAP_UNAVAILABLE_MESSAGE);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async checkoutPlace(reference: string): Promise<{
    latitude: number;
    longitude: number;
    countryCode: string | null;
  }> {
    const payload = await this.checkoutRequest('place/v4', {
      refid: reference,
    });
    const item = this.asRecord(payload);
    const latitude = this.number(item.lat);
    const longitude = this.number(item.lng);
    if (latitude === null || longitude === null) {
      throw this.checkoutProviderUnavailable();
    }
    return {
      latitude,
      longitude,
      countryCode: this.countryCode(item),
    };
  }

  private async checkoutRequest(
    path: string,
    params: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const serviceKey = this.configService
      .get<string>('VIETMAP_SERVICE_KEY')
      ?.trim();
    const baseUrl = (
      this.configService.get<string>('VIETMAP_API_BASE_URL') ||
      'https://maps.vietmap.vn/api'
    ).trim();
    if (!serviceKey) throw this.checkoutProviderUnavailable();

    let url: URL;
    try {
      url = new URL(`${baseUrl.replace(/\/$/, '')}/${path}`);
    } catch {
      throw this.checkoutProviderUnavailable();
    }
    url.searchParams.set('apikey', serviceKey);
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VIETMAP_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw this.checkoutProviderUnavailable();
      return await response.json();
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw this.checkoutProviderUnavailable();
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeCheckoutHybrid(
    item: JsonRecord,
    latitude: number,
    longitude: number,
    fallbackCountryCode: string | null = null,
  ): CheckoutHybridAddress {
    const legacyItem = this.optionalRecord(item.data_old);
    const currentBoundaries = this.asRecordArray(item.boundaries);
    const legacyBoundaries = legacyItem
      ? this.asRecordArray(legacyItem.boundaries)
      : [];
    const currentProvince = currentBoundaries.find(
      (boundary) => boundary.type === 0,
    );
    const currentWard = currentBoundaries.find(
      (boundary) => boundary.type === 2,
    );
    const legacyProvince = legacyBoundaries.find(
      (boundary) => boundary.type === 0,
    );
    const legacyDistrict = legacyBoundaries.find(
      (boundary) => boundary.type === 1,
    );
    const legacyWard = legacyBoundaries.find((boundary) => boundary.type === 2);
    return {
      current: {
        formattedAddress: this.string(item.display) || this.joinDisplay(item),
        addressLine: this.string(item.name) || this.string(item.address),
        provinceName: this.boundaryName(currentProvince) ?? '',
        provinceCode: this.number(currentProvince?.id),
        wardName: this.boundaryName(currentWard) ?? '',
        wardCode: this.number(currentWard?.id),
        latitude,
        longitude,
      },
      legacy: {
        provinceName: this.boundaryName(legacyProvince) ?? '',
        districtName: this.boundaryName(legacyDistrict) ?? '',
        wardName: this.boundaryName(legacyWard) ?? '',
      },
      provider: 'VIETMAP',
      placeId: this.nullableString(item.ref_id),
      countryCode:
        this.countryCode(item) ||
        (legacyItem ? this.countryCode(legacyItem) : null) ||
        fallbackCountryCode,
    };
  }

  private normalizeBoundaryLocation(
    item: JsonRecord,
    fallbackLatitude: number,
    fallbackLongitude: number,
  ): VietMapLocationResponseDto {
    const boundaries = this.asRecordArray(item.boundaries);
    const provinceBoundary = boundaries.find((boundary) => boundary.type === 0);
    const districtBoundary = boundaries.find((boundary) => boundary.type === 1);
    const wardBoundary = boundaries.find((boundary) => boundary.type === 2);
    return {
      latitude: this.number(item.lat) ?? fallbackLatitude,
      longitude: this.number(item.lng) ?? fallbackLongitude,
      countryCode: this.countryCode(item),
      province: this.boundaryName(provinceBoundary),
      district: this.boundaryName(districtBoundary),
      ward: this.boundaryName(wardBoundary),
      address: this.string(item.name) || this.string(item.address),
      displayAddress: this.string(item.display) || this.joinDisplay(item),
    };
  }

  private boundaryName(boundary: JsonRecord | undefined): string | null {
    return boundary
      ? this.nullableString(boundary.full_name) ||
          this.nullableString(boundary.name)
      : null;
  }

  private countryCode(item: JsonRecord): string | null {
    const direct =
      this.nullableString(item.country_code) ||
      this.nullableString(item.countryCode);
    if (direct) return direct.toUpperCase();
    const country = this.nullableString(item.country);
    return country && /vi(?:e|ệ)t\s*nam/i.test(country) ? 'VN' : null;
  }

  private joinDisplay(item: JsonRecord): string {
    return [this.string(item.name), this.string(item.address)]
      .filter(Boolean)
      .join(', ');
  }

  private asRecord(value: unknown): JsonRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw this.malformedResponse();
    }
    return value as JsonRecord;
  }

  private optionalRecord(value: unknown): JsonRecord | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonRecord)
      : null;
  }

  private asRecordArray(value: unknown): JsonRecord[] {
    if (!Array.isArray(value)) throw this.malformedResponse();
    return value.filter(
      (item): item is JsonRecord => typeof item === 'object' && item !== null,
    );
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private nullableString(value: unknown): string | null {
    return this.string(value) || null;
  }

  private number(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private malformedResponse(): BadGatewayException {
    return new BadGatewayException(VIETMAP_UNAVAILABLE_MESSAGE);
  }

  private checkoutProviderUnavailable(): BadGatewayException {
    return new BadGatewayException({
      code: 'ADDRESS_PROVIDER_UNAVAILABLE',
      message:
        'Không thể xác định khu vực giao hàng lúc này. Vui lòng thử lại.',
    });
  }
}
