import { Controller, Delete, Get, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  ApiBaseResponse,
  ResponseMessage,
  UlidParam,
} from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  WishlistListDto,
  WishlistListQueryDto,
  WishlistStateDto,
  WishlistStatusDto,
  WishlistStatusQueryDto,
} from './dto';
import { WishlistsService } from './wishlists.service';

@ApiTags('customer-wishlist')
@ApiSecurity('accessToken')
@Controller('account/wishlist')
@UseGuards(JwtAccessGuard, CsrfGuard)
export class WishlistsController {
  constructor(private readonly service: WishlistsService) {}

  @Get()
  @ApiOperation({
    operationId: 'customerWishlistList',
    summary: 'Danh sách sách yêu thích mới nhất trước',
  })
  @ApiBaseResponse(WishlistListDto, { description: 'Lấy Wishlist thành công' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: WishlistListQueryDto,
  ) {
    return this.service.list(actor, query);
  }

  @Get('status')
  @ApiOperation({
    operationId: 'customerWishlistStatus',
    summary: 'Kiểm tra Wishlist theo batch Product',
  })
  @ApiBaseResponse(WishlistStatusDto, {
    description: 'Lấy trạng thái Wishlist thành công',
  })
  status(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: WishlistStatusQueryDto,
  ) {
    return this.service.status(actor, query.productIds);
  }

  @Put(':productId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerWishlistAdd',
    summary: 'Đặt trạng thái yêu thích cho Product',
  })
  @ApiBaseResponse(WishlistStateDto, { description: 'Đã thêm Wishlist' })
  @ResponseMessage('Đã thêm sách vào danh sách yêu thích')
  add(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('productId') productId: string,
  ) {
    return this.service.add(actor, productId);
  }

  @Delete(':productId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerWishlistRemove',
    summary: 'Đặt trạng thái không còn yêu thích cho Product',
  })
  @ApiBaseResponse(WishlistStateDto, { description: 'Đã xóa Wishlist' })
  @ResponseMessage('Đã xóa sách khỏi danh sách yêu thích')
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('productId') productId: string,
  ) {
    return this.service.remove(actor, productId);
  }
}
