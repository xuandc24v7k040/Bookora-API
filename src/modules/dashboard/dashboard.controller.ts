import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiBaseResponse, ResponseMessage } from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  BranchScope,
  BranchScopeGuard,
  BranchScopeMode,
  CurrentBranchContext,
  Permissions,
  PermissionsGuard,
  type BranchContext,
} from '@/modules/authorization';
import { DashboardService } from './dashboard.service';
import { DashboardOverviewDto, DashboardOverviewQueryDto } from './dto';

@ApiTags('dashboard')
@ApiSecurity('accessToken')
@ApiHeader({
  name: 'X-Branch-Id',
  required: false,
  description:
    'Bỏ trống cho Super Admin toàn hệ thống; bắt buộc với Branch Admin.',
})
@Controller('dashboard')
@UseGuards(JwtAccessGuard, BranchScopeGuard, PermissionsGuard)
@BranchScope(BranchScopeMode.OPTIONAL_SELECTION)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @Permissions('dashboard.read')
  @ApiOperation({
    operationId: 'dashboardOverview',
    summary: 'Lấy dữ liệu Dashboard theo phạm vi được phân quyền',
  })
  @ApiBaseResponse(DashboardOverviewDto, {
    description: 'Lấy dữ liệu Dashboard thành công',
  })
  @ApiResponse({
    status: 403,
    schema: { $ref: '#/components/schemas/ErrorResponseDto' },
  })
  @ResponseMessage('Lấy dữ liệu Dashboard thành công')
  overview(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @Query() query: DashboardOverviewQueryDto,
  ) {
    return this.service.overview(actor, context, query);
  }
}
