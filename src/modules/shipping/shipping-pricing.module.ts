import { Module } from '@nestjs/common';
import { ChargeableWeightCalculator } from './calculators/chargeable-weight.calculator';
import { PackagingCalculator } from './calculators/packaging.calculator';
import { ShippingFeeCalculator } from './calculators/shipping-fee.calculator';
import { DestinationTypeResolver } from './resolvers/destination-type.resolver';
import { ShippingRouteResolver } from './resolvers/shipping-route.resolver';
import { ShippingPricingService } from './shipping-pricing.service';
import { ShippingQuoteFactory } from './shipping-quote.factory';
import { ShippingRatePolicyService } from './shipping-rate-policy.service';

@Module({
  providers: [
    ShippingRouteResolver,
    DestinationTypeResolver,
    PackagingCalculator,
    ChargeableWeightCalculator,
    ShippingRatePolicyService,
    ShippingFeeCalculator,
    ShippingQuoteFactory,
    ShippingPricingService,
  ],
  exports: [ShippingPricingService],
})
export class ShippingPricingModule {}
