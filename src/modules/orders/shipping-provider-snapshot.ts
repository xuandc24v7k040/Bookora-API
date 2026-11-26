import { ShippingProvider } from '@/modules/shipping/shipping-provider';
import type { Prisma } from '@/generated/prisma/client';

export function shippingProviderFromSnapshot(
  snapshot: Prisma.JsonValue,
): ShippingProvider {
  return snapshot !== null &&
    typeof snapshot === 'object' &&
    !Array.isArray(snapshot) &&
    snapshot.provider === 'GHN'
    ? ShippingProvider.GHN
    : ShippingProvider.INTERNAL;
}
