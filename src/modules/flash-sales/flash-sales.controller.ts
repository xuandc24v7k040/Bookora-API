import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
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
import { SuperAdminOnly } from '@/modules/authorization/decorators/super-admin-only.decorator';
import { SuperAdminGuard } from '@/modules/authorization/guards/super-admin.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  FlashSaleControlDto,
  FlashSaleEligibilityDto,
  FlashSaleListQueryDto,
  FlashSaleListResponseDto,
  FlashSaleResponseDto,
  FlashSaleVariantListDto,
  SaveFlashSaleDto,
} from './flash-sales.dto';
import { FlashSalesService } from './flash-sales.service';
import { FlashSaleOffersService } from './flash-sale-offers.service';

@ApiTags('admin-flash-sales')
@ApiSecurity('accessToken')
@ApiResponse({
  status: 409,
  schema: { $ref: '#/components/schemas/ErrorResponseDto' },
})
@SuperAdminOnly()
@UseGuards(JwtAccessGuard, SuperAdminGuard, CsrfGuard)
@Controller('admin/flash-sales')
export class FlashSalesController {
  constructor(private readonly service: FlashSalesService) {}
  @Get()
  @ApiOperation({
    operationId: 'adminFlashSalesList',
    summary: 'Danh sách Flash Sale toàn hệ thống',
  })
  @ApiBaseResponse(FlashSaleListResponseDto, {
    description: 'Danh sách Flash Sale',
  })
  list(@Query() query: FlashSaleListQueryDto) {
    return this.service.list(query);
  }
  @Get('variants')
  @ApiOperation({
    operationId: 'adminFlashSalesVariants',
    summary: 'Biến thể và tổng tồn kho khả dụng',
  })
  @ApiBaseResponse(FlashSaleVariantListDto, {
    description: 'Biến thể tham gia',
  })
  variants(@Query() query: FlashSaleListQueryDto) {
    return this.service.variants(query);
  }
  @Get(':flashSaleId')
  @ApiOperation({
    operationId: 'adminFlashSalesDetail',
    summary: 'Chi tiết Flash Sale',
  })
  @ApiBaseResponse(FlashSaleResponseDto, { description: 'Chi tiết Flash Sale' })
  detail(@UlidParam('flashSaleId') id: string) {
    return this.service.detail(id);
  }
  @Post()
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminFlashSalesCreate',
    summary: 'Tạo bản nháp Flash Sale',
  })
  @ApiBaseResponse(FlashSaleResponseDto, {
    status: 201,
    description: 'Đã tạo Flash Sale',
  })
  create(
    @Body() dto: SaveFlashSaleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.save(dto, actor.id);
  }
  @Patch(':flashSaleId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminFlashSalesUpdate',
    summary: 'Sửa bản nháp Flash Sale',
  })
  @ApiBaseResponse(FlashSaleResponseDto, { description: 'Đã lưu Flash Sale' })
  update(
    @UlidParam('flashSaleId') id: string,
    @Body() dto: SaveFlashSaleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.save(dto, actor.id, id);
  }
  @Post(':flashSaleId/control')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminFlashSalesControl',
    summary: 'Công bố, hủy hoặc dừng sớm Flash Sale',
  })
  @ApiBaseResponse(FlashSaleResponseDto, {
    status: 201,
    description: 'Đã cập nhật trạng thái',
  })
  control(
    @UlidParam('flashSaleId') id: string,
    @Body() dto: FlashSaleControlDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.control(id, dto, actor.id);
  }
}

@ApiTags('storefront-flash-sales')
@Controller('storefront/flash-sales')
export class PublicFlashSalesController {
  constructor(
    private readonly service: FlashSalesService,
    private readonly offers: FlashSaleOffersService,
  ) {}
  @Get()
  @ApiOperation({
    operationId: 'storefrontFlashSalesList',
    summary: 'Flash Sale đang và sắp diễn ra',
  })
  @ApiBaseResponse(FlashSaleListResponseDto, {
    description: 'Flash Sale công khai',
  })
  list(@Query() query: FlashSaleListQueryDto) {
    return this.service.list(query, true);
  }
  @Get('variants/:variantId')
  @ApiOperation({
    operationId: 'storefrontFlashSaleEligibility',
    summary: 'Ưu đãi Flash Sale của biến thể',
  })
  @ApiBaseResponse(FlashSaleEligibilityDto, { description: 'Ưu đãi hiện tại' })
  eligibility(@UlidParam('variantId') id: string) {
    return this.offers.eligibility(id);
  }
  @Get('variants/:variantId/mine')
  @UseGuards(JwtAccessGuard)
  @ApiSecurity('accessToken')
  @ApiOperation({
    operationId: 'customerFlashSaleEligibility',
    summary: 'Suất Flash Sale còn được mua của tài khoản',
  })
  @ApiBaseResponse(FlashSaleEligibilityDto, { description: 'Ưu đãi cá nhân' })
  mine(
    @UlidParam('variantId') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.offers.eligibility(id, actor.id);
  }
}
