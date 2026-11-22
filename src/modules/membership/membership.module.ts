import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import {
  CustomerMembershipController,
  AdminMembershipController,
} from './membership.controller';
import { MembershipQueryService } from './membership-query.service';
import { MembershipThresholdsService } from './membership-thresholds.service';

@Module({
  imports: [AuthModule],
  controllers: [CustomerMembershipController, AdminMembershipController],
  providers: [MembershipQueryService, MembershipThresholdsService],
})
export class MembershipModule {}
