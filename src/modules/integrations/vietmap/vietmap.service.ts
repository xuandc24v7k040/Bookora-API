import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

@Injectable()
export class VietMapService {
  constructor(private readonly configService: ConfigService) {}

  async reverse(
    query: VietMapReverseQueryDto,
  ): Promise<VietMapLocationResponseDto> {
    const payload = await this.request('reverse/v4', {
      lat: String(query.latitude),
      lng: String(query.longitude),
      display_type: '1',
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
      province: this.nullableString(item.city),
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

  private normalizeBoundaryLocation(
    item: JsonRecord,
    fallbackLatitude: number,
    fallbackLongitude: number,
  ): VietMapLocationResponseDto {
    const boundaries = this.asRecordArray(item.boundaries);
    const provinceBoundary = boundaries.find((boundary) => boundary.type === 0);
    const wardBoundary = boundaries.find((boundary) => boundary.type === 2);
    return {
      latitude: this.number(item.lat) ?? fallbackLatitude,
      longitude: this.number(item.lng) ?? fallbackLongitude,
      province: this.boundaryName(provinceBoundary),
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
}
