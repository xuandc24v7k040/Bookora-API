import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
  ResponseMessage,
} from '@/common/decorators';
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
import {
  RevenueBranchesDto,
  RevenueReportQueryDto,
  RevenueSummaryDto,
  RevenueTableRowDto,
  RevenueTrendDto,
} from './dto';
import { RevenueReportsService } from './revenue-reports.service';

@ApiTags('revenue-reports')
@ApiSecurity('accessToken')
@ApiHeader({
  name: 'X-Branch-Id',
  required: false,
  description:
    'Bỏ trống cho Super Admin toàn hệ thống; bắt buộc với Branch Admin.',
})
@ApiResponse({
  status: 403,
  schema: { $ref: '#/components/schemas/ErrorResponseDto' },
})
@Controller('reports/revenue')
@UseGuards(JwtAccessGuard, BranchScopeGuard, PermissionsGuard)
@BranchScope(BranchScopeMode.OPTIONAL_SELECTION)
@Permissions('reports.revenue.read')
export class RevenueReportsController {
  constructor(private readonly service: RevenueReportsService) {}

  @Get('summary')
  @ApiOperation({
    operationId: 'revenueReportSummary',
    summary: 'Tổng hợp doanh thu',
  })
  @ApiBaseResponse(RevenueSummaryDto, {
    description: 'Lấy tổng hợp doanh thu thành công',
  })
  @ResponseMessage('Lấy tổng hợp doanh thu thành công')
  summary(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @Query() query: RevenueReportQueryDto,
  ) {
    return this.service.summary(actor, context, query);
  }

  @Get('trend')
  @ApiOperation({
    operationId: 'revenueReportTrend',
    summary: 'Doanh thu theo thời gian',
  })
  @ApiBaseResponse(RevenueTrendDto, {
    description: 'Lấy xu hướng doanh thu thành công',
  })
  @ResponseMessage('Lấy xu hướng doanh thu thành công')
  trend(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @Query() query: RevenueReportQueryDto,
  ) {
    return this.service.trend(actor, context, query);
  }

  @Get('branches')
  @ApiOperation({
    operationId: 'revenueReportBranches',
    summary: 'Doanh thu theo chi nhánh',
  })
  @ApiBaseResponse(RevenueBranchesDto, {
    description: 'Lấy doanh thu theo chi nhánh thành công',
  })
  @ResponseMessage('Lấy doanh thu theo chi nhánh thành công')
  branches(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @Query() query: RevenueReportQueryDto,
  ) {
    return this.service.branches(actor, context, query);
  }

  @Get('table')
  @ApiOperation({
    operationId: 'revenueReportTable',
    summary: 'Bảng tổng hợp doanh thu phân trang',
  })
  @ApiPaginatedResponse(
    RevenueTableRowDto,
    'Lấy bảng tổng hợp doanh thu thành công',
  )
  @ResponseMessage('Lấy bảng tổng hợp doanh thu thành công')
  table(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @Query() query: RevenueReportQueryDto,
  ) {
    return this.service.table(actor, context, query);
  }

  @Get('export')
  @Permissions('reports.export')
  @ApiOperation({
    operationId: 'revenueReportExport',
    summary: 'Xuất báo cáo doanh thu CSV',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: 200,
    description: 'Tệp CSV UTF-8 BOM theo đúng bộ lọc hiện tại',
    content: {
      'text/csv': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  async export(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @Query() query: RevenueReportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.service.export(actor, context, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    response.send(result.file);
  }
}
