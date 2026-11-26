import { GhnQuoteError } from './ghn.error';

/** Catalog sizes describe books, not their outer shipping carton. Known sizes
 * are lower bounds: never put a measured book/stack into a smaller estimate.
 * Missing thickness is not invented, and no multi-parcel packing is inferred.
 */
export function ensureCatalogFitsParcel(
  dimensions: readonly number[],
  items: ReadonlyArray<{ quantity: number; packageSize?: string | null }>,
): void {
  const outer = [...dimensions].sort((a, b) => b - a);
  let knownStackHeight = 0;
  for (const item of items) {
    const match = item.packageSize
      ?.trim()
      .match(
        /^(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×*]\s*(\d+(?:[.,]\d+)?))?\s*cm$/iu,
      );
    if (!match) continue; // Unstructured catalog prose is not a reliable measurement.
    const measured = match
      .slice(1)
      .filter((value) => value !== undefined)
      .map((value) => Math.ceil(Number(value.replace(',', '.'))))
      .sort((a, b) => b - a);
    if (
      measured.some((size) => !Number.isSafeInteger(size) || size <= 0) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    )
      throw new GhnQuoteError('GHN_PARCEL_UNSUPPORTED');
    if (measured[0] > outer[0] || measured[1] > outer[1])
      throw new GhnQuoteError('GHN_PARCEL_UNSUPPORTED');
    if (measured.length === 3) knownStackHeight += measured[2] * item.quantity;
  }
  if (!Number.isSafeInteger(knownStackHeight) || knownStackHeight > outer[2])
    throw new GhnQuoteError('GHN_PARCEL_UNSUPPORTED');
}
