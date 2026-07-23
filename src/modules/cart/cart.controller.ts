import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Patch,
  Post,
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
  ResponseMessage,
  UlidParam,
} from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { CartService } from './cart.service';
import {
  AddCartItemDto,
  CartBranchDto,
  CartResponseDto,
  UpdateCartItemQuantityDto,
} from './dto';

const ApiCartErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409, 429, 500].map((status) =>
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
    description: 'Chi nhánh storefront hiện tại',
  });

@ApiTags('cart')
@ApiSecurity('accessToken')
@ApiCartErrors()
@Controller('cart')
@UseGuards(JwtAccessGuard, CsrfGuard)
export class CartController {
  constructor(private readonly service: CartService) {}

  @Get()
  @ApiBranchHeader()
  @ApiOperation({ operationId: 'cartGet', summary: 'Lấy giỏ hàng hiện tại' })
  @ApiBaseResponse(CartResponseDto, {
    description: 'Lấy giỏ hàng thành công',
  })
  @ResponseMessage('Lấy giỏ hàng thành công')
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.get(actor, branchId);
  }

  @Post('items')
  @ApiSecurity('csrf')
  @ApiBranchHeader()
  @ApiOperation({
    operationId: 'cartAddItem',
    summary: 'Thêm phiên bản sản phẩm vào giỏ hàng',
  })
  @ApiBaseResponse(CartResponseDto, {
    description: 'Thêm sản phẩm vào giỏ hàng thành công',
    status: 201,
  })
  @ResponseMessage('Đã thêm sản phẩm vào giỏ hàng.')
  add(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() dto: AddCartItemDto,
  ) {
    return this.service.add(actor, branchId, dto);
  }

  @Patch('items/:itemId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'cartUpdateItem',
    summary: 'Cập nhật số lượng CartItem',
  })
  @ApiBaseResponse(CartResponseDto, {
    description: 'Cập nhật giỏ hàng thành công',
  })
  @ResponseMessage('Đã cập nhật số lượng.')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('itemId') itemId: string,
    @Body() dto: UpdateCartItemQuantityDto,
  ) {
    return this.service.update(actor, itemId, dto);
  }

  @Delete('items/:itemId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'cartRemoveItem',
    summary: 'Xóa CartItem khỏi giỏ hàng',
  })
  @ApiBaseResponse(CartResponseDto, {
    description: 'Xóa sản phẩm khỏi giỏ hàng thành công',
  })
  @ResponseMessage('Đã xóa sản phẩm khỏi giỏ hàng.')
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('itemId') itemId: string,
  ) {
    return this.service.remove(actor, itemId);
  }

  @Patch('branch')
  @ApiSecurity('csrf')
  @ApiBranchHeader()
  @ApiOperation({
    operationId: 'cartChangeBranch',
    summary: 'Đổi chi nhánh và revalidate toàn bộ giỏ hàng',
  })
  @ApiBaseResponse(CartResponseDto, {
    description: 'Đổi chi nhánh giỏ hàng thành công',
  })
  @ResponseMessage('Đã cập nhật chi nhánh giỏ hàng.')
  changeBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branchId: string | undefined,
    @Body() dto: CartBranchDto,
  ) {
    if (branchId !== dto.branchId) {
      return this.service.changeBranch(actor, dto.branchId);
    }
    return this.service.changeBranch(actor, branchId);
  }
}
