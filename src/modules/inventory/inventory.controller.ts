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
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  BranchScope,
  BranchScopeGuard,
  BranchScopeMode,
  AnyPermissions,
  CurrentBranchContext,
  Permissions,
  PermissionsGuard,
  type BranchContext,
} from '@/modules/authorization';
import {
  BranchProductStockResponseDto,
  AdjustInventoryQuantityDto,
  GroupedStockListQueryDto,
  InventoryAdjustmentResponseDto,
  InventoryMovementListQueryDto,
  InventoryMovementResponseDto,
  InventoryProductStockResponseDto,
  InventoryVariantOptionResponseDto,
  InventoryVariantOptionsQueryDto,
  StockListQueryDto,
  UpdateLowStockThresholdDto,
} from './dto';
import { InventoryService } from './inventory.service';

const ApiInventoryErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('inventory')
@ApiSecurity('accessToken')
@ApiInventoryErrors()
@Controller('inventory')
@UseGuards(JwtAccessGuard, BranchScopeGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('variant-options')
  @AnyPermissions(
    'products.read',
    'stock_receipts.create',
    'stock_receipts.update',
  )
  @BranchScope(BranchScopeMode.OPTIONAL_SELECTION)
  @ApiHeader({
    name: 'X-Branch-Id',
    required: false,
    description:
      'Chi nhánh dùng để tính quyền effective cho branch actor; không lọc catalog Variant.',
  })
  @ApiOperation({
    operationId: 'inventoryVariantOptions',
    summary: 'Tìm biến thể sản phẩm toàn cục cho phiếu nhập kho',
  })
  @ApiPaginatedResponse(
    InventoryVariantOptionResponseDto,
    'Lấy biến thể sản phẩm thành công',
  )
  @ResponseMessage('Lấy biến thể sản phẩm thành công')
  variantOptions(@Query() query: InventoryVariantOptionsQueryDto) {
    return this.service.listVariantOptions(query);
  }

  @Get('stocks')
  @Permissions('inventory.read')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiOperation({
    operationId: 'inventoryStocksList',
    summary: 'Lấy tồn kho tại chi nhánh đang chọn',
  })
  @ApiPaginatedResponse(
    BranchProductStockResponseDto,
    'Lấy danh sách tồn kho thành công',
  )
  @ResponseMessage('Lấy danh sách tồn kho thành công')
  stocks(
    @CurrentBranchContext() context: BranchContext,
    @Query() query: StockListQueryDto,
  ) {
    return this.service.listStocks(context, query);
  }

  @Get('stocks/grouped')
  @Permissions('inventory.read')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiOperation({
    operationId: 'inventoryGroupedStocksList',
    summary: 'Lấy tồn kho phân nhóm theo sản phẩm tại chi nhánh đang chọn',
  })
  @ApiPaginatedResponse(
    InventoryProductStockResponseDto,
    'Lấy tồn kho phân nhóm thành công',
  )
  @ResponseMessage('Lấy tồn kho phân nhóm thành công')
  groupedStocks(
    @CurrentBranchContext() context: BranchContext,
    @Query() query: GroupedStockListQueryDto,
  ) {
    return this.service.listGroupedStocks(context, query);
  }

  @Get('movements')
  @Permissions('inventory.movements.read')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiOperation({
    operationId: 'inventoryMovementsList',
    summary: 'Lấy nhật ký biến động tồn kho tại chi nhánh đang chọn',
  })
  @ApiPaginatedResponse(
    InventoryMovementResponseDto,
    'Lấy nhật ký tồn kho thành công',
  )
  @ResponseMessage('Lấy nhật ký tồn kho thành công')
  movements(
    @CurrentBranchContext() context: BranchContext,
    @Query() query: InventoryMovementListQueryDto,
  ) {
    return this.service.listMovements(context, query);
  }

  @Post('stocks/:variantId/adjust')
  @Permissions('inventory.adjust_quantity')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'inventoryStocksAdjustQuantity',
    summary: 'Điều chỉnh số lượng tồn kho tại chi nhánh đang chọn',
  })
  @ApiBaseResponse(InventoryAdjustmentResponseDto, {
    description: 'Điều chỉnh số lượng tồn kho thành công',
  })
  @ResponseMessage('Điều chỉnh số lượng tồn kho thành công')
  adjustQuantity(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('variantId') variantId: string,
    @Body() dto: AdjustInventoryQuantityDto,
  ) {
    return this.service.adjustQuantity(actor, context, variantId, dto);
  }

  @Patch('stocks/:variantId/threshold')
  @Permissions('inventory.update_threshold')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'inventoryStocksUpdateThreshold',
    summary: 'Cập nhật ngưỡng cảnh báo tồn thấp tại chi nhánh đang chọn',
  })
  @ApiBaseResponse(BranchProductStockResponseDto, {
    description: 'Cập nhật ngưỡng cảnh báo thành công',
  })
  @ResponseMessage('Cập nhật ngưỡng cảnh báo thành công')
  updateThreshold(
    @CurrentBranchContext() context: BranchContext,
    @UlidParam('variantId') variantId: string,
    @Body() dto: UpdateLowStockThresholdDto,
  ) {
    return this.service.updateThreshold(context, variantId, dto);
  }
}
