const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

export function normalizeMasterDataName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function normalizeNullableText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim().replace(/\s+/gu, ' ');
  return normalized || null;
}

export function startOfVietnamDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day) - VIETNAM_UTC_OFFSET_MS);
}

export function startOfNextVietnamDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day + 1) - VIETNAM_UTC_OFFSET_MS);
}

export function paginationMeta(total: number, page: number, limit: number) {
  const lastPage = Math.max(1, Math.ceil(total / limit));
  return {
    total,
    page,
    lastPage,
    limit,
    hasNextPage: page < lastPage,
    hasPreviousPage: page > 1,
  };
}

export function normalizeAttributeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'D')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}
