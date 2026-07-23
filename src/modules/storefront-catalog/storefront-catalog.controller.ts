import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  applyDecorators,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiBaseResponse,
  ResponseMessage,
  UlidParam,
} from '@/common/decorators';
import {
  ProductAvailabilityQueryDto,
  PublicCategoryResponseDto,
  PublicHomeResponseDto,
  PublicProductAvailabilityDto,
  PublicProductDetailDto,
  PublicProductListResponseDto,
  PublicProductQueryDto,
} from './dto';
import { StorefrontCatalogService } from './storefront-catalog.service';

const ApiStorefrontErrors = () =>
  applyDecorators(
    ...[400, 404, 409, 429, 500].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('storefront-catalog')
@ApiStorefrontErrors()
@Controller('storefront')
export class StorefrontCatalogController {
  constructor(private readonly service: StorefrontCatalogService) {}

  @Get('categories')
  @ApiOperation({
    operationId: 'storefrontCategoriesList',
    summary: 'Lấy cây danh mục public hai cấp',
  })
  @ApiBaseResponse(PublicCategoryResponseDto, {
    description: 'Lấy danh mục public thành công',
    isArray: true,
  })
  @ResponseMessage('Lấy danh mục public thành công')
  categories() {
    return this.service.categories();
  }

  @Get('home')
  @ApiOperation({
    operationId: 'storefrontHomeGet',
    summary: 'Lấy các section sản phẩm Homepage',
  })
  @ApiBaseResponse(PublicHomeResponseDto, {
    description: 'Lấy dữ liệu trang chủ thành công',
  })
  @ResponseMessage('Lấy dữ liệu trang chủ thành công')
  home() {
    return this.service.home();
  }

  @Get('products')
  @ApiOperation({
    operationId: 'storefrontProductsList',
    summary: 'Tìm kiếm và lọc sản phẩm public',
  })
  @ApiBaseResponse(PublicProductListResponseDto, {
    description: 'Lấy danh sách sản phẩm thành công',
  })
  @ResponseMessage('Lấy danh sách sản phẩm thành công')
  products(@Query() query: PublicProductQueryDto) {
    return this.service.list(query);
  }

  @Get('products/:productId/availability')
  @ApiHeader({
    name: 'X-Branch-Id',
    required: true,
    schema: { type: 'string', format: 'ulid' },
    description: 'Chi nhánh storefront đã chọn',
  })
  @ApiOperation({
    operationId: 'storefrontProductAvailability',
    summary: 'Lấy tồn kho public theo chi nhánh và biến thể',
  })
  @ApiBaseResponse(PublicProductAvailabilityDto, {
    description: 'Lấy tình trạng tồn kho thành công',
  })
  @ResponseMessage('Lấy tình trạng tồn kho thành công')
  availability(
    @Headers('x-branch-id') branchId: string | undefined,
    @UlidParam('productId') productId: string,
    @Query() query: ProductAvailabilityQueryDto,
  ) {
    return this.service.availability(branchId, productId, query.variantId);
  }

  @Get('products/:slug')
  @ApiOperation({
    operationId: 'storefrontProductDetail',
    summary: 'Lấy chi tiết sản phẩm public theo slug',
  })
  @ApiBaseResponse(PublicProductDetailDto, {
    description: 'Lấy chi tiết sản phẩm thành công',
  })
  @ResponseMessage('Lấy chi tiết sản phẩm thành công')
  detail(@Param('slug') slug: string) {
    return this.service.detail(slug);
  }
}
