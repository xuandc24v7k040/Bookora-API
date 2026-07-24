import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBaseResponse, ResponseMessage } from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { VietMapReverseQueryDto } from '@/modules/integrations/vietmap/dto/vietmap.dto';
import { CheckoutService } from './checkout.service';
import {
  CheckoutPreviewResponseDto,
  CurrentLocationReverseResponseDto,
  CurrentLocationResolveDto,
  CurrentLocationSuggestionDto,
  PlaceOrderDto,
  PlaceOrderResponseDto,
  PreviewCheckoutDto,
  VnpayPlaceOrderResponseDto,
} from './dto';

const ApiCheckoutErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409, 422, 429, 500, 502, 504].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

const ApiBranchHeader = () =>
  ApiHeader({
    name: 'X-Branch-Id',
    required: true,
    schema: { type: 'string', format: 'ulid' },
    description: 'Chi nhánh storefront phải khớp với Cart.branchId',
  });

@ApiTags('checkout')
@ApiSecurity('accessToken')
@ApiCheckoutErrors()
@Controller('checkout')
@UseGuards(JwtAccessGuard, CsrfGuard)
export class CheckoutController {
  constructor(private readonly service: CheckoutService) {}

  @Post('preview')
  @ApiSecurity('csrf')
  @ApiBranchHeader()
  @ApiOperation({
    operationId: 'checkoutPreview',
    summary: 'Revalidate CartItem và tính checkout preview stateless',
  })
  @ApiBaseResponse(CheckoutPreviewResponseDto, {
    status: 201,
    description: 'Checkout preview không ghi database.',
  })
  @ResponseMessage('Đã cập nhật thông tin thanh toán.')
  preview(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() dto: PreviewCheckoutDto,
  ) {
    return this.service.preview(actor, branchId, dto);
  }

  @Post('current-location/resolve')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'checkoutResolveCurrentLocation',
    summary: 'Resolve vị trí Checkout qua Vietmap hybrid và GHN',
  })
  @ApiBaseResponse(CurrentLocationSuggestionDto, {
    description: 'Địa chỉ gợi ý từ vị trí hiện tại.',
  })
  resolveCurrentLocation(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CurrentLocationResolveDto,
  ) {
    return this.service.resolveCurrentLocation(actor, dto);
  }

  @Get('current-location/reverse')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'checkoutReverseCurrentLocation',
    summary: 'Reverse geocode vị trí cho Customer Checkout',
  })
  @ApiBaseResponse(CurrentLocationReverseResponseDto, {
    description: 'Địa chỉ hành chính hai cấp từ Vietmap hybrid v4.',
  })
  reverseCurrentLocation(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: VietMapReverseQueryDto,
  ) {
    return this.service.reverseCurrentLocation(actor, query);
  }

  @Post('place-order/cod')
  @ApiSecurity('csrf')
  @ApiBranchHeader()
  @ApiOperation({
    operationId: 'checkoutPlaceOrderCod',
    summary: 'Final revalidate và đặt đơn COD atomic, idempotent',
  })
  @ApiBaseResponse(PlaceOrderResponseDto, {
    status: 201,
    description: 'Đơn COD đã được tạo.',
  })
  @ResponseMessage('Đặt hàng thành công.')
  placeCod(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() dto: PlaceOrderDto,
  ) {
    return this.service.placeCod(actor, branchId, dto);
  }

  @Post('place-order/vnpay')
  @ApiSecurity('csrf')
  @ApiBranchHeader()
  @ApiOperation({
    operationId: 'checkoutPlaceOrderVnpay',
    summary: 'Final revalidate, tạo VNPAY attempt và giữ stock',
  })
  @ApiBaseResponse(VnpayPlaceOrderResponseDto, {
    status: 201,
    description: 'Phiên thanh toán VNPAY đã được tạo.',
  })
  @ResponseMessage('Đã tạo phiên thanh toán VNPAY.')
  placeVnpay(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() dto: PlaceOrderDto,
    @Req() request: Request,
  ) {
    return this.service.placeVnpay(
      actor,
      branchId,
      dto,
      request.ip || request.socket.remoteAddress || '127.0.0.1',
    );
  }
}
