import { BadRequestException } from '@nestjs/common';

export const ANALYTICS_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type AnalyticsPreset = '7D' | '30D' | '90D';

export interface AnalyticsDateRange {
  from: string;
  to: string;
  fromInclusive: Date;
  toExclusive: Date;
  comparisonFrom: string;
  comparisonTo: string;
  comparisonFromInclusive: Date;
  comparisonToExclusive: Date;
  days: number;
  preset: AnalyticsPreset | null;
}

function vietnamDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ANALYTICS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseVietnamDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) invalidRange();
  const parsed = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime()) || vietnamDate(parsed) !== value) {
    invalidRange();
  }
  return parsed;
}

function formatVietnamTimestamp(date: Date): string {
  return vietnamDate(date);
}

function invalidRange(): never {
  throw new BadRequestException({
    code: 'ANALYTICS_DATE_RANGE_INVALID',
    message: 'Khoảng thời gian không hợp lệ.',
  });
}

export function resolveAnalyticsDateRange(input: {
  preset?: AnalyticsPreset;
  from?: string;
  to?: string;
  now?: Date;
}): AnalyticsDateRange {
  const hasCustom = Boolean(input.from || input.to);
  if (hasCustom && (!input.from || !input.to || input.preset)) invalidRange();

  const preset = hasCustom ? null : (input.preset ?? '30D');
  const now = input.now ?? new Date();
  const toDate = hasCustom
    ? parseVietnamDate(input.to!)
    : parseVietnamDate(vietnamDate(now));
  const days = hasCustom ? 0 : Number(preset!.slice(0, -1));
  const fromDate = hasCustom
    ? parseVietnamDate(input.from!)
    : new Date(toDate.getTime() - (days - 1) * DAY_MS);
  const toExclusive = new Date(toDate.getTime() + DAY_MS);
  const resolvedDays = Math.round(
    (toExclusive.getTime() - fromDate.getTime()) / DAY_MS,
  );

  if (resolvedDays < 1) invalidRange();
  if (resolvedDays > MAX_RANGE_DAYS) {
    throw new BadRequestException({
      code: 'ANALYTICS_DATE_RANGE_TOO_LARGE',
      message: 'Khoảng thời gian báo cáo không được vượt quá một năm.',
    });
  }

  const comparisonToExclusive = new Date(fromDate);
  const comparisonFromInclusive = new Date(
    comparisonToExclusive.getTime() - resolvedDays * DAY_MS,
  );
  return {
    from: formatVietnamTimestamp(fromDate),
    to: formatVietnamTimestamp(toDate),
    fromInclusive: fromDate,
    toExclusive,
    comparisonFrom: formatVietnamTimestamp(comparisonFromInclusive),
    comparisonTo: formatVietnamTimestamp(
      new Date(comparisonToExclusive.getTime() - DAY_MS),
    ),
    comparisonFromInclusive,
    comparisonToExclusive,
    days: resolvedDays,
    preset,
  };
}

export function enumerateDateBuckets(
  range: AnalyticsDateRange,
): Array<{ key: string; from: string; to: string }> {
  return Array.from({ length: range.days }, (_, index) => {
    const date = new Date(range.fromInclusive.getTime() + index * DAY_MS);
    const key = vietnamDate(date);
    return { key, from: key, to: key };
  });
}
