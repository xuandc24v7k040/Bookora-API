import { ChargeableWeightCalculator } from './calculators/chargeable-weight.calculator';
import { PackagingCalculator } from './calculators/packaging.calculator';
import { ShippingFeeCalculator } from './calculators/shipping-fee.calculator';
import { DestinationTypeResolver } from './resolvers/destination-type.resolver';
import { ShippingRouteResolver } from './resolvers/shipping-route.resolver';
import { ShippingPricingService } from './shipping-pricing.service';
import { ShippingQuoteFactory } from './shipping-quote.factory';
import { ShippingRatePolicyService } from './shipping-rate-policy.service';

function createService() {
  return new ShippingPricingService(
    new ShippingRouteResolver(),
    new DestinationTypeResolver(),
    new PackagingCalculator(),
    new ChargeableWeightCalculator(),
    new ShippingRatePolicyService(),
    new ShippingFeeCalculator(),
    new ShippingQuoteFactory(),
  );
}

describe('BOOKORA_STANDARD_2026_V1 pricing', () => {
  const service = createService();

  it('accepts the Hà Nội -> Cần Thơ ward 1 kg case', () => {
    const quote = service.calculate({
      originProvinceCode: 1,
      destinationProvinceCode: 92,
      destinationType: 'WARD',
      totalItemQuantity: 1,
      productWeightGram: 900,
    });
    expect(quote).toEqual(
      expect.objectContaining({
        policyCode: 'BOOKORA_STANDARD_2026_V1',
        packagingPolicyCode: 'PACKAGING_POLICY_V1',
        routeType: 'FAR_REGION',
        destinationType: 'WARD',
        packagingType: 'SINGLE_BOOK_BAG',
        grossWeightGram: 1_000,
        chargeableWeightGram: 1_000,
        baseFee: 32_000,
        extraSteps: 1,
        baseShippingFee: 37_000,
        fuelSurcharge: 1_850,
        shippingFee: 39_000,
        ruleCode: 'HANOI_HCM_FAR_REGION_WARD',
      }),
    );
  });

  it('accepts the Hà Nội -> Cần Thơ commune 1 kg case', () => {
    expect(
      service.calculate({
        originProvinceCode: 1,
        destinationProvinceCode: 92,
        destinationType: 'COMMUNE',
        totalItemQuantity: 1,
        productWeightGram: 900,
      }),
    ).toEqual(
      expect.objectContaining({
        baseFee: 40_000,
        baseShippingFee: 45_000,
        fuelSurcharge: 2_250,
        shippingFee: 48_000,
      }),
    );
  });

  it('uses the other-origin same-province 3 kg base rate', () => {
    expect(
      service.calculate({
        originProvinceCode: 92,
        destinationProvinceCode: 92,
        destinationType: 'WARD',
        totalItemQuantity: 4,
        productWeightGram: 2_600,
      }),
    ).toEqual(
      expect.objectContaining({
        routeType: 'SAME_PROVINCE',
        chargeableWeightGram: 3_000,
        baseFee: 30_000,
        extraSteps: 0,
        fuelSurcharge: 1_500,
        shippingFee: 32_000,
      }),
    );
  });

  it('hashes every canonical breakdown field deterministically', () => {
    const input = {
      originProvinceCode: 1,
      destinationProvinceCode: 92,
      destinationType: 'WARD' as const,
      totalItemQuantity: 3,
      productWeightGram: 1_070,
    };
    const first = service.calculate(input);
    const second = service.calculate(input);
    expect(first.requestFingerprint).toBe(second.requestFingerprint);
    expect(first.breakdown).toEqual(
      expect.objectContaining({
        totalItemQuantity: 3,
        productWeightGram: 1_070,
        packagingType: 'SMALL_BOOK_BOX',
        chargeableWeightGram: 1_500,
        policyVersion: 1,
      }),
    );
  });
});
