import { Injectable } from '@nestjs/common';
import type {
  DestinationTypeResolution,
  PricingDestinationType,
  ShippingDestinationType,
} from '../policies/shipping-policy.types';

export interface ResolvedDestinationType {
  sourceType: ShippingDestinationType;
  destinationType: PricingDestinationType;
  resolution: DestinationTypeResolution;
}

@Injectable()
export class DestinationTypeResolver {
  fromAdministrativeName(
    value: string | null | undefined,
  ): ShippingDestinationType {
    const normalized = this.normalize(value ?? '');
    if (/^phuong\b/.test(normalized)) return 'WARD';
    if (/^xa\b/.test(normalized)) return 'COMMUNE';
    if (/^dac khu\b/.test(normalized)) return 'SPECIAL_ZONE';
    return 'UNKNOWN';
  }

  resolve(sourceType: ShippingDestinationType): ResolvedDestinationType {
    if (sourceType === 'WARD' || sourceType === 'COMMUNE') {
      return {
        sourceType,
        destinationType: sourceType,
        resolution: 'AUTHORITATIVE',
      };
    }
    return {
      sourceType,
      destinationType: 'COMMUNE',
      resolution: 'DESTINATION_TYPE_FALLBACK_COMMUNE',
    };
  }

  normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/đ/gi, 'd')
      .toLocaleLowerCase('vi-VN')
      .trim()
      .replace(/\s+/g, ' ');
  }
}
