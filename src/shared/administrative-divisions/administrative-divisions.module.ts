import { Module } from '@nestjs/common';
import { VietnamAdministrativeUnitsService } from './vietnam-administrative-units.service';

@Module({
  providers: [VietnamAdministrativeUnitsService],
  exports: [VietnamAdministrativeUnitsService],
})
export class AdministrativeDivisionsModule {}
