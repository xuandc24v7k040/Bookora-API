import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  ShippingPricingQuote,
  ShippingQuoteBreakdown,
} from './policies/shipping-policy.types';

@Injectable()
export class ShippingQuoteFactory {
  create(breakdown: ShippingQuoteBreakdown): ShippingPricingQuote {
    const quotedAt = new Date();
    return {
      ...breakdown,
      serviceFee: breakdown.shippingFee,
      insuranceFee: 0,
      codFee: 0,
      remoteAreaFee: 0,
      quotedAt,
      expiresAt: new Date(quotedAt.getTime() + 24 * 60 * 60 * 1_000),
      requestFingerprint: createHash('sha256')
        .update(JSON.stringify(breakdown))
        .digest('hex'),
      breakdown,
    };
  }
}
