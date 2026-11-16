import type { Prisma } from '@/generated/prisma/client';

/** OrderItem options are the immutable purchase snapshot; never read live variants. */
export function purchasedVariantLabel(
  options: Prisma.JsonValue | undefined,
): string | null {
  if (!Array.isArray(options) || options.length === 0) return null;
  const labels: string[] = [];
  for (const option of options) {
    if (
      !option ||
      typeof option !== 'object' ||
      Array.isArray(option) ||
      typeof option.name !== 'string' ||
      typeof option.value !== 'string' ||
      !option.name.trim() ||
      !option.value.trim()
    )
      return null;
    labels.push(`${option.name.trim()}: ${option.value.trim()}`);
  }
  return labels.join(' · ');
}

export const reviewMediaOrder = [
  { sortOrder: 'asc' },
  { id: 'asc' },
] satisfies Prisma.ReviewMediaOrderByWithRelationInput[];
export const reviewDisplayInclude = {
  orderItem: { select: { variantOptions: true } },
  media: {
    orderBy: reviewMediaOrder,
    select: { id: true, url: true, sortOrder: true },
  },
} satisfies Prisma.ReviewInclude;
