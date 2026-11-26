import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GhnConfig } from '@/config/ghn.config';
import { GhnQuoteError } from './ghn.error';
import type {
  GhnMasterRow,
  GhnPreviewPayload,
  GhnPreviewResult,
} from './ghn.types';

const PROVINCES = '/shiip/public-api/v3/master-data/province/all';
const WARDS = '/shiip/public-api/v3/master-data/ward/all-by-province-id';
const PREVIEW = '/shiip/public-api/v2/shipping-order/preview';
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class GhnClient {
  constructor(private readonly config: ConfigService) {}

  settings(): GhnConfig {
    return this.config.get<GhnConfig>('ghn') ?? { enabled: false };
  }

  async masterData(
    provinceId: number | undefined,
    signal: AbortSignal,
  ): Promise<GhnMasterRow[]> {
    const body = await this.request(
      provinceId === undefined ? PROVINCES : WARDS,
      provinceId === undefined
        ? '?offset=0&limit=200'
        : `?province_id=${provinceId}&offset=0&limit=200`,
      undefined,
      signal,
    );
    if (
      !Array.isArray(body.data) ||
      body.data.length === 0 ||
      body.data.length >= 200
    )
      throw new GhnQuoteError('GHN_ADDRESS_UNRESOLVED');
    return body.data.map((row: unknown) => {
      if (
        !record(row) ||
        !Number.isSafeInteger(row._id) ||
        typeof row.name !== 'string' ||
        !row.name.trim() ||
        !Number.isSafeInteger(row.parent_id) ||
        !Number.isInteger(row.status) ||
        !Array.isArray(row.extension_names) ||
        !row.extension_names.every(
          (name: unknown) => typeof name === 'string',
        ) ||
        (provinceId !== undefined && row.parent_id !== provinceId)
      )
        throw new GhnQuoteError('GHN_ADDRESS_UNRESOLVED');
      return {
        _id: row._id as number,
        name: row.name,
        parent_id: row.parent_id as number,
        status: row.status as number,
        extension_names: row.extension_names,
      };
    });
  }

  async preview(
    payload: GhnPreviewPayload,
    signal: AbortSignal,
  ): Promise<GhnPreviewResult> {
    // Explicit FROM is mandatory here even though GHN makes it optional. Never default to Shop address.
    if (
      !payload.from_address.trim() ||
      !payload.from_province_name.trim() ||
      !payload.from_ward_name.trim() ||
      payload.is_new_from_address !== true ||
      !payload.to_address.trim() ||
      !payload.to_province_name.trim() ||
      !payload.to_ward_name.trim() ||
      payload.is_new_to_address !== true
    )
      throw new GhnQuoteError('GHN_ADDRESS_UNRESOLVED');
    const body = await this.request(PREVIEW, '', payload, signal);
    const data = body.data;
    if (
      !record(data) ||
      data.order_code !== '' ||
      typeof data.total_fee !== 'number' ||
      !Number.isSafeInteger(data.total_fee) ||
      data.total_fee < 0 ||
      typeof data.expected_delivery_time !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(
        data.expected_delivery_time,
      ) ||
      !Number.isFinite(Date.parse(data.expected_delivery_time)) ||
      !record(data.fee)
    )
      throw new GhnQuoteError('GHN_UNAVAILABLE');
    const components: Record<string, number> = {};
    for (const [key, value] of Object.entries(data.fee)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value))
        throw new GhnQuoteError('GHN_UNAVAILABLE');
      components[key] = value;
    }
    return {
      shippingFee: data.total_fee,
      estimatedDeliveryAt: new Date(data.expected_delivery_time).toISOString(),
      feeComponents: components,
    };
  }

  private async request(
    path: string,
    query: string,
    payload: GhnPreviewPayload | undefined,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const settings = this.settings();
    if (
      !settings.enabled ||
      !settings.valid ||
      ![PROVINCES, WARDS, PREVIEW].includes(path)
    )
      throw new GhnQuoteError('GHN_UNAVAILABLE');
    try {
      const response = await fetch(new URL(path + query, settings.baseUrl), {
        method: payload ? 'POST' : 'GET',
        redirect: 'error',
        signal,
        headers: {
          Token: settings.token,
          ShopId: settings.shopId,
          'Content-Type': 'application/json',
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      const body: unknown = await response.json();
      if (
        response.ok &&
        record(body) &&
        body.code === 200 &&
        body.data === null &&
        path !== PREVIEW
      ) {
        throw new GhnQuoteError('GHN_ADDRESS_UNRESOLVED');
      }
      if (
        !response.ok ||
        !record(body) ||
        body.code !== 200 ||
        body.data === null
      ) {
        const code =
          record(body) && typeof body.code_message === 'string'
            ? body.code_message
            : '';
        if (['COD_IS_OVER_LIMIT', 'PRICE_DECLARE_OVER_LIMIT'].includes(code))
          throw new GhnQuoteError('GHN_VALUE_UNSUPPORTED');
        if (
          [
            'FROM_ADDRESS_CONFLICT',
            'FROM_ADDRESS_CONVERT_FAIL',
            'TO_ADDRESS_CONFLICT',
            'TO_ADDRESS_CONVERT_FAIL',
          ].includes(code)
        )
          throw new GhnQuoteError('GHN_ADDRESS_UNRESOLVED');
        if (
          ['ROUTE_NOT_FOUND_SERVICE', 'SERVICE_NOT_FOUND_CONFIG_FEE'].includes(
            code,
          )
        )
          throw new GhnQuoteError('GHN_ROUTE_UNSUPPORTED');
        if (
          [
            'LENGTH_IS_OVER_LIMIT',
            'WIDTH_IS_OVER_LIMIT',
            'HEIGHT_IS_OVER_LIMIT',
            'WEIGHT_IS_OVER_LIMIT',
            'SERVICE_TYPE_IS_INVALID',
          ].includes(code)
        )
          throw new GhnQuoteError('GHN_PARCEL_UNSUPPORTED');
        throw new GhnQuoteError('GHN_UNAVAILABLE');
      }
      return body;
    } catch (error: unknown) {
      if (error instanceof GhnQuoteError) throw error;
      // Never surface provider bodies, request headers, recipient data or fetch errors containing URLs.
      throw new GhnQuoteError('GHN_UNAVAILABLE');
    }
  }
}
