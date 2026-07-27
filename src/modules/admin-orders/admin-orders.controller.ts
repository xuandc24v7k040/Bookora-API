import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
  ResponseMessage,
  UlidParam,
} from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
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
import { AdminOrdersService } from './admin-orders.service';
import {
  AdminOrderCancelDto,
  AdminOrderDetailDto,
  AdminOrderInternalNoteDto,
  AdminOrderListItemDto,
  AdminOrderListQueryDto,
  AdminOrderTransitionDto,
} from './dto';

const ApiAdminOrderErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('admin-orders')
@ApiSecurity('accessToken')
@ApiHeader({
  name: 'X-Branch-Id',
  required: true,
  description: 'Chi nhánh đang được chọn trong Branch Context của Admin.',
})
@ApiAdminOrderErrors()
@Controller('admin/orders')
@UseGuards(JwtAccessGuard, BranchScopeGuard, PermissionsGuard)
@BranchScope(BranchScopeMode.REQUIRED_SELECTION)
export class AdminOrdersController {
  constructor(private readonly service: AdminOrdersService) {}

  @Get()
  @Permissions('orders.read')
  @ApiOperation({
    operationId: 'adminOrdersList',
    summary: 'Lấy danh sách đơn hàng theo chi nhánh đang chọn',
  })
  @ApiPaginatedResponse(
    AdminOrderListItemDto,
    'Lấy danh sách đơn hàng thành công',
  )
  @ResponseMessage('Lấy danh sách đơn hàng thành công')
  list(
    @CurrentBranchContext() context: BranchContext,
    @Query() query: AdminOrderListQueryDto,
  ) {
    return this.service.list(context, query);
  }

  @Get(':orderId')
  @Permissions('orders.read')
  @ApiOperation({
    operationId: 'adminOrdersDetail',
    summary: 'Lấy chi tiết đơn hàng theo chi nhánh đang chọn',
  })
  @ApiBaseResponse(AdminOrderDetailDto, {
    description: 'Lấy chi tiết đơn hàng thành công',
  })
  @ResponseMessage('Lấy chi tiết đơn hàng thành công')
  detail(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('orderId') orderId: string,
  ) {
    return this.service.detail(actor, context, orderId);
  }

  @Post(':orderId/transitions')
  @Permissions('orders.update_status')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminOrdersTransition',
    summary: 'Chuyển trạng thái xử lý đơn hàng',
  })
  @ApiBaseResponse(AdminOrderDetailDto, {
    description: 'Cập nhật trạng thái đơn hàng thành công',
  })
  @ResponseMessage('Cập nhật trạng thái đơn hàng thành công')
  transition(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('orderId') orderId: string,
    @Body() dto: AdminOrderTransitionDto,
  ) {
    return this.service.transition(actor, context, orderId, dto);
  }

  @Post(':orderId/cancel')
  @Permissions('orders.cancel')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminOrdersCancel',
    summary: 'Hủy đơn hàng và hoàn tồn kho khi cần',
  })
  @ApiBaseResponse(AdminOrderDetailDto, {
    description: 'Hủy đơn hàng thành công',
  })
  @ResponseMessage('Hủy đơn hàng thành công')
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('orderId') orderId: string,
    @Body() dto: AdminOrderCancelDto,
  ) {
    return this.service.cancel(actor, context, orderId, dto);
  }

  @Patch(':orderId/internal-note')
  @Permissions('orders.update_note')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminOrdersUpdateInternalNote',
    summary: 'Cập nhật ghi chú nội bộ của đơn hàng',
  })
  @ApiBaseResponse(AdminOrderDetailDto, {
    description: 'Cập nhật ghi chú nội bộ thành công',
  })
  @ResponseMessage('Cập nhật ghi chú nội bộ thành công')
  updateInternalNote(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('orderId') orderId: string,
    @Body() dto: AdminOrderInternalNoteDto,
  ) {
    return this.service.updateInternalNote(actor, context, orderId, dto);
  }
}
