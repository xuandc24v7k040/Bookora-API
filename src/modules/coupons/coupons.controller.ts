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
import {
  CouponActiveDto,
  CouponListQueryDto,
  CouponListResponseDto,
  CouponResponseDto,
  SaveCouponDto,
} from './coupons.dto';
import { CouponsService } from './coupons.service';

const ApiCouponErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409, 429].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('admin-coupons')
@ApiSecurity('accessToken')
@ApiCouponErrors()
@SuperAdminOnly()
@UseGuards(JwtAccessGuard, SuperAdminGuard, CsrfGuard)
@Controller('admin/coupons')
export class CouponsController {
  constructor(private readonly service: CouponsService) {}
  @Get()
  @ApiOperation({
    operationId: 'adminCouponsList',
    summary: 'Danh sách khuyến mãi toàn hệ thống (SUPER_ADMIN)',
  })
  @ApiBaseResponse(CouponListResponseDto, {
    description: 'Danh sách mã giảm giá',
  })
  list(@Query() query: CouponListQueryDto) {
    return this.service.list(query);
  }
  @Get(':couponId')
  @ApiOperation({
    operationId: 'adminCouponsDetail',
    summary: 'Chi tiết mã giảm giá',
  })
  @ApiBaseResponse(CouponResponseDto, { description: 'Chi tiết mã giảm giá' })
  detail(@UlidParam('couponId') id: string) {
    return this.service.detail(id);
  }
  @Post()
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminCouponsCreate',
    summary: 'Tạo mã giảm giá',
  })
  @ApiBaseResponse(CouponResponseDto, {
    status: 201,
    description: 'Đã tạo mã giảm giá',
  })
  create(@Body() dto: SaveCouponDto) {
    return this.service.save(dto);
  }
  @Patch(':couponId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminCouponsUpdate',
    summary: 'Cập nhật quy tắc cho đơn hàng mới, giữ snapshot lịch sử',
  })
  @ApiBaseResponse(CouponResponseDto, {
    description: 'Đã cập nhật mã giảm giá',
  })
  update(@UlidParam('couponId') id: string, @Body() dto: SaveCouponDto) {
    return this.service.save(dto, id);
  }
  @Patch(':couponId/active')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminCouponsSetActive',
    summary: 'Bật hoặc tạm dừng mã giảm giá',
  })
  @ApiBaseResponse(CouponResponseDto, {
    description: 'Đã cập nhật trạng thái mã',
  })
  active(@UlidParam('couponId') id: string, @Body() dto: CouponActiveDto) {
    return this.service.setActive(id, dto.isActive);
  }
}
