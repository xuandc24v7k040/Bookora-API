import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
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
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
  ResponseMessage,
  UlidParam,
} from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
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
  CreateStockReceiptDto,
  StockReceiptDetailResponseDto,
  StockReceiptListItemResponseDto,
  StockReceiptListQueryDto,
  UpdateStockReceiptDraftDto,
} from './dto';
import { StockReceiptsService } from './stock-receipts.service';

const ApiStockReceiptErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('stock-receipts')
@ApiSecurity('accessToken')
@ApiStockReceiptErrors()
@Controller('stock-receipts')
@BranchScope(BranchScopeMode.REQUIRED_SELECTION)
@UseGuards(JwtAccessGuard, BranchScopeGuard, PermissionsGuard)
export class StockReceiptsController {
  constructor(private readonly service: StockReceiptsService) {}

  @Get()
  @Permissions('stock_receipts.read')
  @ApiOperation({
    operationId: 'stockReceiptsList',
    summary: 'Lấy danh sách phiếu nhập tại chi nhánh đang chọn',
  })
  @ApiPaginatedResponse(
    StockReceiptListItemResponseDto,
    'Lấy danh sách phiếu nhập thành công',
  )
  @ResponseMessage('Lấy danh sách phiếu nhập thành công')
  list(
    @CurrentBranchContext() context: BranchContext,
    @Query() query: StockReceiptListQueryDto,
  ) {
    return this.service.list(context, query);
  }

  @Post()
  @Permissions('stock_receipts.create')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'stockReceiptsCreate',
    summary: 'Tạo phiếu nhập bản nháp cùng các mặt hàng atomically',
  })
  @ApiBaseResponse(StockReceiptDetailResponseDto, {
    status: 201,
    description: 'Tạo phiếu nhập thành công',
  })
  @ResponseMessage('Tạo phiếu nhập thành công')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @Body() dto: CreateStockReceiptDto,
  ) {
    return this.service.create(actor, context, dto);
  }

  @Get(':id')
  @Permissions('stock_receipts.read')
  @ApiOperation({
    operationId: 'stockReceiptsGet',
    summary: 'Lấy chi tiết phiếu nhập tại chi nhánh đang chọn',
  })
  @ApiBaseResponse(StockReceiptDetailResponseDto, {
    description: 'Lấy chi tiết phiếu nhập thành công',
  })
  @ResponseMessage('Lấy chi tiết phiếu nhập thành công')
  get(
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('id') id: string,
  ) {
    return this.service.get(context, id);
  }

  @Patch(':id')
  @Permissions('stock_receipts.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'stockReceiptsUpdate',
    summary: 'Cập nhật toàn bộ phiếu nhập bản nháp atomically',
  })
  @ApiBaseResponse(StockReceiptDetailResponseDto, {
    description: 'Cập nhật phiếu nhập thành công',
  })
  @ResponseMessage('Cập nhật phiếu nhập thành công')
  update(
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('id') id: string,
    @Body() dto: UpdateStockReceiptDraftDto,
  ) {
    return this.service.update(context, id, dto);
  }

  @Delete(':id')
  @Permissions('stock_receipts.cancel')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'stockReceiptsCancel',
    summary: 'Chuyển phiếu nhập DRAFT sang CANCELLED, không hard-delete',
  })
  @ApiBaseResponse(StockReceiptDetailResponseDto, {
    description: 'Hủy phiếu nhập thành công',
  })
  @ResponseMessage('Hủy phiếu nhập thành công')
  cancel(
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('id') id: string,
  ) {
    return this.service.cancel(context, id);
  }

  @Post(':id/confirm')
  @Permissions('stock_receipts.confirm')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'stockReceiptsConfirm',
    summary: 'Xác nhận phiếu nhập và cộng tồn kho atomically, idempotent',
  })
  @ApiBaseResponse(StockReceiptDetailResponseDto, {
    description: 'Xác nhận nhập kho thành công',
  })
  @ResponseMessage('Xác nhận nhập kho thành công')
  confirm(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('id') id: string,
  ) {
    return this.service.confirm(actor, context, id);
  }
}
