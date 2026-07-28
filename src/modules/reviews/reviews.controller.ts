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
  ResponseMessage,
  UlidParam,
} from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { SuperAdminOnly } from '@/modules/authorization/decorators/super-admin-only.decorator';
import { SuperAdminGuard } from '@/modules/authorization/guards/super-admin.guard';
import {
  AdminReviewDto,
  AdminReviewListDto,
  AdminReviewListQueryDto,
  CreateReviewDto,
  CustomerReviewDto,
  CustomerReviewListDto,
  CustomerReviewListQueryDto,
  PendingReviewListDto,
  PendingReviewQueryDto,
  PublicReviewListDto,
  PublicReviewQueryDto,
  ReviewDeletedDto,
  ReviewVisibilityDto,
  UpdateReviewDto,
} from './dto';
import { ReviewsService } from './reviews.service';

const ApiReviewErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409, 429].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('public-reviews')
@ApiReviewErrors()
@Controller('storefront/products/:productId/reviews')
export class PublicReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Get()
  @ApiOperation({
    operationId: 'storefrontProductReviewsList',
    summary: 'Lấy đánh giá visible của sản phẩm, mới nhất trước',
  })
  @ApiBaseResponse(PublicReviewListDto, {
    description: 'Lấy đánh giá sản phẩm thành công',
  })
  list(
    @UlidParam('productId') productId: string,
    @Query() query: PublicReviewQueryDto,
  ) {
    return this.service.publicList(productId, query);
  }
}

@ApiTags('customer-reviews')
@ApiSecurity('accessToken')
@ApiReviewErrors()
@UseGuards(JwtAccessGuard, CsrfGuard)
@Controller('account/reviews')
export class CustomerReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Get()
  @ApiOperation({
    operationId: 'customerReviewsList',
    summary: 'Đánh giá của tôi',
  })
  @ApiBaseResponse(CustomerReviewListDto, {
    description: 'Lấy đánh giá thành công',
  })
  mine(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: CustomerReviewListQueryDto,
  ) {
    return this.service.mine(actor, query);
  }

  @Get('pending')
  @ApiOperation({
    operationId: 'customerReviewsPending',
    summary: 'Các lượt Order + Product đang chờ đánh giá',
  })
  @ApiBaseResponse(PendingReviewListDto, {
    description: 'Lấy lượt chờ đánh giá thành công',
  })
  pending(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: PendingReviewQueryDto,
  ) {
    return this.service.pending(actor, query);
  }

  @Post()
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerReviewsCreate',
    summary: 'Viết đánh giá cho lượt mua đã hoàn thành',
  })
  @ApiBaseResponse(CustomerReviewDto, {
    description: 'Tạo đánh giá thành công',
  })
  @ResponseMessage('Đã gửi đánh giá')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.service.create(actor, dto);
  }

  @Patch(':reviewId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerReviewsUpdate',
    summary: 'Cập nhật đánh giá của tôi',
  })
  @ApiBaseResponse(CustomerReviewDto, {
    description: 'Cập nhật đánh giá thành công',
  })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('reviewId') reviewId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.service.update(actor, reviewId, dto);
  }

  @Delete(':reviewId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerReviewsDelete',
    summary: 'Xóa đánh giá của tôi',
  })
  @ApiBaseResponse(ReviewDeletedDto, { description: 'Xóa đánh giá thành công' })
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('reviewId') reviewId: string,
  ) {
    return this.service.remove(actor, reviewId);
  }
}

@ApiTags('admin-reviews')
@ApiSecurity('accessToken')
@ApiReviewErrors()
@SuperAdminOnly()
@UseGuards(JwtAccessGuard, SuperAdminGuard)
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Get()
  @ApiOperation({
    operationId: 'adminReviewsList',
    summary: 'Danh sách Review global chỉ dành cho Super Admin',
  })
  @ApiBaseResponse(AdminReviewListDto, {
    description: 'Lấy danh sách Review thành công',
  })
  list(@Query() query: AdminReviewListQueryDto) {
    return this.service.adminList(query);
  }

  @Patch(':reviewId/visibility')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'adminReviewsSetVisibility',
    summary: 'Ẩn hoặc hiển thị lại Review',
  })
  @ApiBaseResponse(AdminReviewDto, {
    description: 'Cập nhật visibility thành công',
  })
  visibility(
    @UlidParam('reviewId') reviewId: string,
    @Body() dto: ReviewVisibilityDto,
  ) {
    return this.service.setVisibility(reviewId, dto.isVisible);
  }
}
