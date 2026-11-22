import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiBaseResponse, UlidParam } from '@/common/decorators';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { SuperAdminOnly } from '@/modules/authorization/decorators/super-admin-only.decorator';
import { SuperAdminGuard } from '@/modules/authorization/guards/super-admin.guard';
import { MembershipQueryService } from './membership-query.service';
import { MembershipThresholdsService } from './membership-thresholds.service';
import {
  MemberDto,
  MembersListDto,
  MembersQueryDto,
  MembershipConfigDto,
  MembershipCouponsDto,
  MembershipHistoriesDto,
  MembershipPageQueryDto,
  MembershipSummaryDto,
  MembershipTransactionsDto,
  UpdateMembershipThresholdsDto,
} from './membership.dto';

const MembershipErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409, 429].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('membership')
@ApiSecurity('accessToken')
@MembershipErrors()
@UseGuards(JwtAccessGuard)
@Controller('account/membership')
export class CustomerMembershipController {
  constructor(private readonly service: MembershipQueryService) {}
  @Get()
  @ApiOperation({
    operationId: 'myMembership',
    summary: 'Hạng thành viên của tôi',
  })
  @ApiBaseResponse(MembershipSummaryDto, {
    description: 'Hạng và tiến độ tích lũy',
  })
  async summary(@CurrentUser() actor: AuthenticatedUser) {
    const {
      currentTier,
      lifetimeSpend,
      achievedAt,
      tiers,
      nextTier,
      remainingSpend,
      progress,
    } = await this.service.summary(this.service.customer(actor));
    return {
      currentTier,
      lifetimeSpend,
      achievedAt,
      tiers,
      nextTier,
      remainingSpend,
      progress,
    };
  }
  @Get('coupons')
  @ApiOperation({
    operationId: 'myMembershipCoupons',
    summary: 'Coupon công khai đủ hạng và còn hiệu lực',
  })
  @ApiBaseResponse(MembershipCouponsDto, {
    description: 'Ưu đãi theo chiến dịch',
  })
  coupons(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MembershipPageQueryDto,
  ) {
    return this.service.coupons(this.service.customer(actor), query);
  }
  @Get('transactions')
  @ApiOperation({
    operationId: 'myMembershipTransactions',
    summary: 'Lịch sử tích lũy của tôi',
  })
  @ApiBaseResponse(MembershipTransactionsDto, {
    description: 'Lịch sử tích lũy',
  })
  transactions(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MembershipPageQueryDto,
  ) {
    return this.service.transactions(this.service.customer(actor), query);
  }
}

@ApiTags('admin-membership')
@ApiSecurity('accessToken')
@MembershipErrors()
@SuperAdminOnly()
@UseGuards(JwtAccessGuard, SuperAdminGuard, CsrfGuard)
@Controller('admin/membership')
export class AdminMembershipController {
  constructor(
    private readonly service: MembershipQueryService,
    private readonly thresholds: MembershipThresholdsService,
  ) {}
  @Get('config')
  @ApiOperation({
    operationId: 'adminMembershipConfig',
    summary: 'Cấu hình ngưỡng thành viên',
  })
  @ApiBaseResponse(MembershipConfigDto, {
    description: 'Cấu hình và trạng thái xét lại',
  })
  config() {
    return this.service.config();
  }
  @Patch('config')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminMembershipUpdateConfig',
    summary: 'Cập nhật nguyên bộ ngưỡng',
  })
  @ApiBaseResponse(MembershipConfigDto, {
    description: 'Đã lưu; pending cho biết còn xét lại',
  })
  save(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateMembershipThresholdsDto,
  ) {
    return this.thresholds.save(actor.id, dto);
  }
  @Get('members')
  @ApiOperation({
    operationId: 'adminMembershipMembers',
    summary: 'Danh sách khách hàng và hạng',
  })
  @ApiBaseResponse(MembersListDto, { description: 'Danh sách thành viên' })
  members(@Query() query: MembersQueryDto) {
    return this.service.members(query);
  }
  @Get('members/:userId')
  @ApiOperation({
    operationId: 'adminMembershipDetail',
    summary: 'Chi tiết hạng thành viên',
  })
  @ApiBaseResponse(MemberDto, { description: 'Chi tiết thành viên' })
  detail(@UlidParam('userId') userId: string) {
    return this.service.summary(userId);
  }
  @Get('members/:userId/transactions')
  @ApiOperation({
    operationId: 'adminMembershipTransactions',
    summary: 'Đơn tích lũy của thành viên',
  })
  @ApiBaseResponse(MembershipTransactionsDto, {
    description: 'Lịch sử tích lũy',
  })
  transactions(
    @UlidParam('userId') userId: string,
    @Query() query: MembershipPageQueryDto,
  ) {
    return this.service.transactions(userId, query);
  }
  @Get('members/:userId/history')
  @ApiOperation({
    operationId: 'adminMembershipHistory',
    summary: 'Lịch sử nâng hạng',
  })
  @ApiBaseResponse(MembershipHistoriesDto, { description: 'Lịch sử nâng hạng' })
  history(
    @UlidParam('userId') userId: string,
    @Query() query: MembershipPageQueryDto,
  ) {
    return this.service.histories(userId, query);
  }
}
