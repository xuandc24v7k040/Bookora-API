import { Module } from '@nestjs/common';
import { AdministrativeDivisionsModule } from '@/shared/administrative-divisions/administrative-divisions.module';
import { CustomerAddressesController } from './customer-addresses.controller';
import { CustomerAddressesRepository } from './customer-addresses.repository';
import { CustomerAddressesService } from './customer-addresses.service';

@Module({
  imports: [AdministrativeDivisionsModule],
  controllers: [CustomerAddressesController],
  providers: [CustomerAddressesRepository, CustomerAddressesService],
  exports: [CustomerAddressesService],
})
export class CustomerAddressesModule {}
