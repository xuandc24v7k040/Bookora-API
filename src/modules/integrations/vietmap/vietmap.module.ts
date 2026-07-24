import { Module } from '@nestjs/common';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { PermissionsGuard } from '@/modules/authorization/guards/permissions.guard';
import { VietMapController } from './vietmap.controller';
import { VietMapService } from './vietmap.service';

@Module({
  controllers: [VietMapController],
  providers: [VietMapService, JwtAccessGuard, PermissionsGuard],
  exports: [VietMapService],
})
export class VietMapModule {}
