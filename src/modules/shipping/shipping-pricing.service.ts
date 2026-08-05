import { Injectable } from '@nestjs/common';
import { ChargeableWeightCalculator } from './calculators/chargeable-weight.calculator';
import { PackagingCalculator } from './calculators/packaging.calculator';
import { ShippingFeeCalculator } from './calculators/shipping-fee.calculator';
import { BOOKORA_STANDARD_2026_V1 } from './policies/bookora-standard-2026-v1';
import { PACKAGING_POLICY_V1 } from './policies/packaging-policy-v1';
import type {
  ShippingDestinationType,
  ShippingPricingQuote,
} from './policies/shipping-policy.types';
import { DestinationTypeResolver } from './resolvers/destination-type.resolver';
import { ShippingRouteResolver } from './resolvers/shipping-route.resolver';
import { ShippingQuoteFactory } from './shipping-quote.factory';
import { ShippingRatePolicyService } from './shipping-rate-policy.service';

export interface ShippingPricingInput {
  originProvinceCode: number;
  destinationProvinceCode: number;
  destinationType: ShippingDestinationType;
  totalItemQuantity: number;
  productWeightGram: number;
}

@Injectable()
export class ShippingPricingService {
  constructor(
    private readonly routeResolver: ShippingRouteResolver,
    private readonly destinationResolver: DestinationTypeResolver,
    private readonly packagingCalculator: PackagingCalculator,
    private readonly weightCalculator: ChargeableWeightCalculator,
    private readonly ratePolicy: ShippingRatePolicyService,
    private readonly feeCalculator: ShippingFeeCalculator,
    private readonly quoteFactory: ShippingQuoteFactory,
  ) {}

  calculate(input: ShippingPricingInput): ShippingPricingQuote {
    const routeType = this.routeResolver.resolve(
      input.originProvinceCode,
      input.destinationProvinceCode,
    );
    const destination = this.destinationResolver.resolve(input.destinationType);
    const packaging = this.packagingCalculator.calculate(
      input.totalItemQuantity,
      input.productWeightGram,
    );
    const weight = this.weightCalculator.calculate(
      input.productWeightGram,
      packaging.packagingWeightGram,
    );
    const rate = this.ratePolicy.resolve(
      input.originProvinceCode,
      routeType,
      destination.destinationType,
    );
    const fee = this.feeCalculator.calculate(weight.chargeableWeightGram, rate);

    return this.quoteFactory.create({
      policyCode: BOOKORA_STANDARD_2026_V1.policyCode,
      policyVersion: BOOKORA_STANDARD_2026_V1.policyVersion,
      policyReference: BOOKORA_STANDARD_2026_V1.reference,
      packagingPolicyCode: PACKAGING_POLICY_V1.code,
      packagingPolicyVersion: PACKAGING_POLICY_V1.version,
      routeType,
      destinationType: destination.destinationType,
      destinationTypeResolution: destination.resolution,
      productWeightGram: input.productWeightGram,
      totalItemQuantity: input.totalItemQuantity,
      packagingType: packaging.code,
      packagingWeightGram: packaging.packagingWeightGram,
      grossWeightGram: weight.grossWeightGram,
      chargeableWeightGram: weight.chargeableWeightGram,
      baseWeightGram: rate.baseWeightGram,
      baseFee: rate.baseFee,
      extraSteps: fee.extraSteps,
      extraStepFee: rate.extraStepFee,
      baseShippingFee: fee.baseShippingFee,
      fuelSurchargePercent: BOOKORA_STANDARD_2026_V1.fuelSurchargePercent,
      fuelSurcharge: fee.fuelSurcharge,
      roundingUnit: BOOKORA_STANDARD_2026_V1.roundingUnit,
      shippingFee: fee.shippingFee,
      ruleCode: rate.ruleCode,
    });
  }

  resolveProvinceCode(provinceName: string | null | undefined): number {
    return this.routeResolver.resolveProvinceCode(provinceName);
  }

  normalizeProvinceName(value: string): string {
    return this.routeResolver.normalizeProvinceName(value);
  }

  resolveDestinationType(
    name: string | null | undefined,
  ): ShippingDestinationType {
    return this.destinationResolver.fromAdministrativeName(name);
  }
}
