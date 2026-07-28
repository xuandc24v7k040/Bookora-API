import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiBaseResponse } from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { AccountDashboardService } from './account-dashboard.service';
import { AccountDashboardDto } from './dto/account-dashboard.dto';

@ApiTags('customer-account')
@ApiSecurity('accessToken')
@Controller('account/dashboard')
@UseGuards(JwtAccessGuard)
export class AccountDashboardController {
  constructor(private readonly service: AccountDashboardService) {}

  @Get()
  @ApiOperation({
    operationId: 'customerAccountDashboard',
    summary: 'Tổng quan tài khoản bằng dữ liệu Order, Review và Wishlist thật',
  })
  @ApiBaseResponse(AccountDashboardDto, {
    description: 'Lấy tổng quan tài khoản thành công',
  })
  get(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.get(actor);
  }
}
