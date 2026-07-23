import { Injectable } from '@nestjs/common';
import type { Prisma } from '@/generated/prisma/client';

interface PriceInput {
  originalPrice: Prisma.Decimal | number;
  salePrice: Prisma.Decimal | number | null;
  saleStartAt: Date | null;
  saleEndAt: Date | null;
}

export interface StorefrontPrice {
  current: number;
  original: number;
  onSale: boolean;
  discountPercent: number;
}

@Injectable()
export class StorefrontPriceService {
  resolve(input: PriceInput, now = new Date()): StorefrontPrice {
    const original = Number(input.originalPrice);
    const sale = input.salePrice === null ? null : Number(input.salePrice);
    const withinSchedule =
      (!input.saleStartAt || input.saleStartAt.getTime() <= now.getTime()) &&
      (!input.saleEndAt || input.saleEndAt.getTime() > now.getTime());
    const onSale =
      sale !== null && sale >= 0 && sale < original && withinSchedule;
    const current = onSale ? sale : original;

    return {
      current,
      original,
      onSale,
      discountPercent: onSale
        ? Math.max(0, Math.round(((original - current) / original) * 100))
        : 0,
    };
  }
}
