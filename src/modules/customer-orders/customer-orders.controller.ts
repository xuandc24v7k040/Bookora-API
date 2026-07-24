import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiBaseResponse } from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { CustomerOrdersService } from './customer-orders.service';
import {
  CancelCustomerOrderDto,
  CustomerOrderListQueryDto,
  CustomerOrderListResponseDto,
  CustomerOrderResponseDto,
} from './dto/customer-order.dto';

@ApiTags('customer-orders')
@ApiSecurity('accessToken')
@Controller('customer/orders')
@UseGuards(JwtAccessGuard)
export class CustomerOrdersController {
  constructor(private readonly service: CustomerOrdersService) {}

  @Get()
  @ApiOperation({ operationId: 'customerOrdersList', summary: 'Đơn của tôi' })
  @ApiBaseResponse(CustomerOrderListResponseDto, {
    description: 'Danh sách đơn của khách hàng.',
  })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: CustomerOrderListQueryDto,
  ) {
    return this.service.list(actor, query);
  }

  @Get(':orderId')
  @ApiOperation({
    operationId: 'customerOrderDetail',
    summary: 'Chi tiết đơn của tôi',
  })
  @ApiBaseResponse(CustomerOrderResponseDto, {
    description: 'Chi tiết đơn và snapshot sản phẩm.',
  })
  detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.service.detail(actor, orderId);
  }

  @Post(':orderId/cancel')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerOrderCancel',
    summary: 'Hủy đơn còn đủ điều kiện',
  })
  @ApiBaseResponse(CustomerOrderResponseDto, {
    description: 'Đơn đã được hủy an toàn.',
  })
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CancelCustomerOrderDto,
  ) {
    return this.service.cancel(actor, orderId, dto.reason);
  }
}
