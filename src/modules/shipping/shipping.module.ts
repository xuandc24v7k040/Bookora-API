import { Module } from '@nestjs/common';
import { ShippingAddressCompatibilityService } from './compatibility/shipping-address-compatibility.service';
import { GhnService } from './ghn/ghn.service';

@Module({
  providers: [GhnService, ShippingAddressCompatibilityService],
  exports: [GhnService, ShippingAddressCompatibilityService],
})
export class ShippingModule {}
