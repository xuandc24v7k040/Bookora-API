import { Prisma } from '../../../src/generated/prisma/client';
import { STOREFRONT_SALE_PERIODS } from './storefront-catalog.data';
import type {
  StorefrontProductDefinition,
  StorefrontSaleState,
} from './storefront-catalog.data';

export function storefrontSaleDates(state: StorefrontSaleState): {
  saleStartAt: Date | null;
  saleEndAt: Date | null;
} {
  if (state === 'NONE') return { saleStartAt: null, saleEndAt: null };
  return {
    saleStartAt: new Date(STOREFRONT_SALE_PERIODS[state].startAt),
    saleEndAt: new Date(STOREFRONT_SALE_PERIODS[state].endAt),
  };
}

export function storefrontCombinationKey(
  definition: StorefrontProductDefinition,
  optionValue?: string,
): string {
  if (!definition.option) return 'DEFAULT';
  if (!optionValue) {
    throw new Error(`Missing option value for ${definition.slug}`);
  }
  return `${definition.option.code}=${optionValue}`;
}

export function storefrontMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function normalizeSeedName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}
