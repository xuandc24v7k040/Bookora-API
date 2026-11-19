import { BadRequestException } from '@nestjs/common';
import { Prisma, type FlashSale } from '@/generated/prisma/client';

export const FLASH_SALE_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'ENDED',
  'CANCELLED',
  'STOPPED_EARLY',
] as const;
export type FlashSaleStatus = (typeof FLASH_SALE_STATUSES)[number];

export function flashSaleStatus(
  sale: Pick<FlashSale, 'state' | 'startAt' | 'endAt'>,
  now = new Date(),
): FlashSaleStatus {
  if (sale.state !== 'PUBLISHED') return sale.state;
  return sale.endAt <= now
    ? 'ENDED'
    : sale.startAt > now
      ? 'SCHEDULED'
      : 'ACTIVE';
}

export function flashPriceFromPercent(
  catalog: number,
  percent: number,
): number {
  if (
    !Number.isSafeInteger(catalog) ||
    catalog <= 0 ||
    catalog > 9_999_999_999 ||
    !Number.isFinite(percent) ||
    percent <= 0 ||
    percent >= 100 ||
    new Prisma.Decimal(percent).decimalPlaces() > 2
  )
    throw new BadRequestException({
      code: 'FLASH_SALE_PRICE_INVALID',
      message:
        'Tỷ lệ giảm phải lớn hơn 0, nhỏ hơn 100 và có tối đa 2 chữ số thập phân.',
    });
  const price = new Prisma.Decimal(catalog)
    .mul(new Prisma.Decimal(100).minus(percent))
    .div(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
  assertFlashPrice(price, catalog);
  return price;
}

export function assertFlashPrice(price: number, catalog: number): void {
  if (
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    price >= catalog ||
    price > 9_999_999_999
  )
    throw new BadRequestException({
      code: 'FLASH_SALE_PRICE_INVALID',
      message:
        'Giá Flash Sale phải là số nguyên VND lớn hơn 0 và nhỏ hơn giá catalog hiện tại.',
    });
}

export function flashDiscountPercent(catalog: number, price: number): number {
  return catalog > price && catalog > 0
    ? new Prisma.Decimal(catalog)
        .minus(price)
        .mul(100)
        .div(catalog)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        .toNumber()
    : 0;
}
