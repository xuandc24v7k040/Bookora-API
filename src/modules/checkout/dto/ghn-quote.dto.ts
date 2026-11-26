import { ApiProperty } from '@nestjs/swagger';
import type { GhnQuote } from '@/modules/integrations/ghn/ghn.types';

export class GhnShippingQuoteDto {
  @ApiProperty({ enum: ['GHN'] }) provider!: 'GHN';
  @ApiProperty({ minimum: 0 }) shippingFee!: number;
  @ApiProperty({ format: 'date-time' }) estimatedDeliveryAt!: string;
  @ApiProperty() quoteReference!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
}

export class GhnShippingOptionDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: GhnShippingQuoteDto, nullable: true })
  quote!: GhnShippingQuoteDto | null;
  @ApiProperty({ type: String, nullable: true }) unavailableCode!:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) message!: string | null;
}

export function toGhnShippingQuoteDto(
  quote: GhnQuote | null,
): GhnShippingQuoteDto | null {
  return quote
    ? {
        provider: 'GHN',
        shippingFee: quote.shippingFee,
        estimatedDeliveryAt: quote.estimatedDeliveryAt,
        quoteReference: quote.quoteReference,
        expiresAt: quote.expiresAt,
      }
    : null;
}
