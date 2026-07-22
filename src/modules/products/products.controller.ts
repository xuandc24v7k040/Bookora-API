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
import {
  BranchScope,
  BranchScopeGuard,
  BranchScopeMode,
  Permissions,
  PermissionsGuard,
} from '@/modules/authorization';
import {
  BulkCreateProductVariantsDto,
  CreateProductDto,
  CreateProductOptionDto,
  CreateProductOptionValueDto,
  CreateProductVariantDto,
  ProductDeleteResponseDto,
  ProductDetailResponseDto,
  ProductListItemResponseDto,
  ProductListQueryDto,
  ProductOptionResponseDto,
  ProductOptionValueResponseDto,
  ProductVariantResponseDto,
  UpdateProductDto,
  UpdateProductOptionDto,
  UpdateProductOptionValueDto,
  UpdateProductStatusDto,
  UpdateProductVariantDto,
  VariantPreviewResponseDto,
} from './dto';
import { ProductsService } from './products.service';

const ApiProductErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('products')
@ApiSecurity('accessToken')
@ApiHeader({
  name: 'X-Branch-Id',
  required: false,
  description:
    'Chi nhánh dùng để tính quyền effective cho branch actor; không lọc catalog Product.',
})
@ApiProductErrors()
@Controller('products')
@BranchScope(BranchScopeMode.OPTIONAL_SELECTION)
@UseGuards(JwtAccessGuard, BranchScopeGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @Permissions('products.read')
  @ApiOperation({
    operationId: 'productsList',
    summary:
      'Lấy danh sách sản phẩm với lọc, sắp xếp và phân trang phía máy chủ',
  })
  @ApiPaginatedResponse(
    ProductListItemResponseDto,
    'Lấy danh sách sản phẩm thành công',
  )
  @ResponseMessage('Lấy danh sách sản phẩm thành công')
  list(@Query() query: ProductListQueryDto) {
    return this.service.findAll(query);
  }

  @Post()
  @Permissions('products.create')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productsCreate',
    summary: 'Tạo sản phẩm bản nháp',
  })
  @ApiBaseResponse(ProductDetailResponseDto, {
    status: 201,
    description: 'Tạo sản phẩm thành công',
  })
  @ResponseMessage('Tạo sản phẩm thành công')
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @Permissions('products.read')
  @ApiOperation({
    operationId: 'productsGet',
    summary: 'Lấy chi tiết sản phẩm',
  })
  @ApiBaseResponse(ProductDetailResponseDto, {
    description: 'Lấy chi tiết sản phẩm thành công',
  })
  @ResponseMessage('Lấy chi tiết sản phẩm thành công')
  get(@UlidParam('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productsUpdate',
    summary: 'Cập nhật thông tin và các liên kết của sản phẩm',
  })
  @ApiBaseResponse(ProductDetailResponseDto, {
    description: 'Cập nhật sản phẩm thành công',
  })
  @ResponseMessage('Cập nhật sản phẩm thành công')
  update(@UlidParam('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @Permissions('products.publish')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productsUpdateStatus',
    summary: 'Chuyển trạng thái sản phẩm sau khi kiểm tra invariant',
  })
  @ApiBaseResponse(ProductDetailResponseDto, {
    description: 'Cập nhật trạng thái sản phẩm thành công',
  })
  @ResponseMessage('Cập nhật trạng thái sản phẩm thành công')
  updateStatus(
    @UlidParam('id') id: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    return this.service.updateStatus(id, dto);
  }

  @Delete(':id')
  @Permissions('products.delete')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productsDelete',
    summary: 'Xóa sản phẩm DRAFT không có tham chiếu nghiệp vụ',
  })
  @ApiBaseResponse(ProductDeleteResponseDto, {
    description: 'Xóa sản phẩm thành công',
  })
  @ResponseMessage('Xóa sản phẩm thành công')
  remove(@UlidParam('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':productId/options')
  @Permissions('products.read')
  @ApiOperation({
    operationId: 'productOptionsList',
    summary: 'Lấy Options và Option Values thuộc sản phẩm',
  })
  @ApiBaseResponse(ProductOptionResponseDto, {
    isArray: true,
    description: 'Lấy lựa chọn sản phẩm thành công',
  })
  @ResponseMessage('Lấy lựa chọn sản phẩm thành công')
  listOptions(@UlidParam('productId') productId: string) {
    return this.service.listOptions(productId);
  }

  @Post(':productId/options')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productOptionsCreate',
    summary: 'Thêm lựa chọn vào sản phẩm',
  })
  @ApiBaseResponse(ProductOptionResponseDto, {
    status: 201,
    description: 'Thêm lựa chọn thành công',
  })
  @ResponseMessage('Thêm lựa chọn thành công')
  createOption(
    @UlidParam('productId') productId: string,
    @Body() dto: CreateProductOptionDto,
  ) {
    return this.service.createOption(productId, dto);
  }

  @Patch(':productId/options/:optionId')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productOptionsUpdate',
    summary: 'Cập nhật lựa chọn đúng ownership sản phẩm',
  })
  @ApiBaseResponse(ProductOptionResponseDto, {
    description: 'Cập nhật lựa chọn thành công',
  })
  @ResponseMessage('Cập nhật lựa chọn thành công')
  updateOption(
    @UlidParam('productId') productId: string,
    @UlidParam('optionId') optionId: string,
    @Body() dto: UpdateProductOptionDto,
  ) {
    return this.service.updateOption(productId, optionId, dto);
  }

  @Delete(':productId/options/:optionId')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productOptionsDelete',
    summary: 'Xóa lựa chọn chưa được biến thể sử dụng',
  })
  @ApiBaseResponse(ProductOptionResponseDto, {
    description: 'Xóa lựa chọn thành công',
  })
  @ResponseMessage('Xóa lựa chọn thành công')
  removeOption(
    @UlidParam('productId') productId: string,
    @UlidParam('optionId') optionId: string,
  ) {
    return this.service.removeOption(productId, optionId);
  }

  @Post(':productId/options/:optionId/values')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productOptionValuesCreate',
    summary: 'Thêm giá trị cho lựa chọn đúng ownership',
  })
  @ApiBaseResponse(ProductOptionValueResponseDto, {
    status: 201,
    description: 'Thêm giá trị lựa chọn thành công',
  })
  @ResponseMessage('Thêm giá trị lựa chọn thành công')
  createOptionValue(
    @UlidParam('productId') productId: string,
    @UlidParam('optionId') optionId: string,
    @Body() dto: CreateProductOptionValueDto,
  ) {
    return this.service.createOptionValue(productId, optionId, dto);
  }

  @Patch(':productId/options/:optionId/values/:valueId')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productOptionValuesUpdate',
    summary: 'Cập nhật giá trị lựa chọn đúng ownership',
  })
  @ApiBaseResponse(ProductOptionValueResponseDto, {
    description: 'Cập nhật giá trị lựa chọn thành công',
  })
  @ResponseMessage('Cập nhật giá trị lựa chọn thành công')
  updateOptionValue(
    @UlidParam('productId') productId: string,
    @UlidParam('optionId') optionId: string,
    @UlidParam('valueId') valueId: string,
    @Body() dto: UpdateProductOptionValueDto,
  ) {
    return this.service.updateOptionValue(productId, optionId, valueId, dto);
  }

  @Delete(':productId/options/:optionId/values/:valueId')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productOptionValuesDelete',
    summary: 'Xóa giá trị lựa chọn chưa được biến thể sử dụng',
  })
  @ApiBaseResponse(ProductOptionValueResponseDto, {
    description: 'Xóa giá trị lựa chọn thành công',
  })
  @ResponseMessage('Xóa giá trị lựa chọn thành công')
  removeOptionValue(
    @UlidParam('productId') productId: string,
    @UlidParam('optionId') optionId: string,
    @UlidParam('valueId') valueId: string,
  ) {
    return this.service.removeOptionValue(productId, optionId, valueId);
  }

  @Get(':productId/variants')
  @Permissions('products.read')
  @ApiOperation({
    operationId: 'productVariantsList',
    summary: 'Lấy danh sách biến thể thuộc sản phẩm',
  })
  @ApiBaseResponse(ProductVariantResponseDto, {
    isArray: true,
    description: 'Lấy danh sách biến thể thành công',
  })
  @ResponseMessage('Lấy danh sách biến thể thành công')
  listVariants(@UlidParam('productId') productId: string) {
    return this.service.listVariants(productId);
  }

  @Post(':productId/variants/generate-preview')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productVariantsGeneratePreview',
    summary: 'Sinh preview Cartesian từ Options/Values đã lưu, không persist',
  })
  @ApiBaseResponse(VariantPreviewResponseDto, {
    description: 'Sinh preview biến thể thành công',
  })
  @ResponseMessage('Sinh preview biến thể thành công')
  generatePreview(@UlidParam('productId') productId: string) {
    return this.service.generatePreview(productId);
  }

  @Post(':productId/variants/bulk')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productVariantsBulkCreate',
    summary: 'Tạo nhiều biến thể atomically',
  })
  @ApiBaseResponse(ProductVariantResponseDto, {
    status: 201,
    isArray: true,
    description: 'Tạo các biến thể thành công',
  })
  @ResponseMessage('Tạo các biến thể thành công')
  bulkCreateVariants(
    @UlidParam('productId') productId: string,
    @Body() dto: BulkCreateProductVariantsDto,
  ) {
    return this.service.bulkCreateVariants(productId, dto);
  }

  @Post(':productId/variants')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productVariantsCreate',
    summary: 'Tạo biến thể với combinationKey do backend sinh',
  })
  @ApiBaseResponse(ProductVariantResponseDto, {
    status: 201,
    description: 'Tạo biến thể thành công',
  })
  @ResponseMessage('Tạo biến thể thành công')
  createVariant(
    @UlidParam('productId') productId: string,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.service.createVariant(productId, dto);
  }

  @Get(':productId/variants/:variantId')
  @Permissions('products.read')
  @ApiOperation({
    operationId: 'productVariantsGet',
    summary: 'Lấy chi tiết biến thể đúng ownership sản phẩm',
  })
  @ApiBaseResponse(ProductVariantResponseDto, {
    description: 'Lấy chi tiết biến thể thành công',
  })
  @ResponseMessage('Lấy chi tiết biến thể thành công')
  getVariant(
    @UlidParam('productId') productId: string,
    @UlidParam('variantId') variantId: string,
  ) {
    return this.service.findVariant(productId, variantId);
  }

  @Patch(':productId/variants/:variantId/default')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productVariantsSetDefault',
    summary: 'Đặt biến thể mặc định atomically',
  })
  @ApiBaseResponse(ProductVariantResponseDto, {
    description: 'Đặt biến thể mặc định thành công',
  })
  @ResponseMessage('Đặt biến thể mặc định thành công')
  setDefaultVariant(
    @UlidParam('productId') productId: string,
    @UlidParam('variantId') variantId: string,
  ) {
    return this.service.setDefaultVariant(productId, variantId);
  }

  @Patch(':productId/variants/:variantId')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productVariantsUpdate',
    summary: 'Cập nhật biến thể và tái sinh combinationKey atomically',
  })
  @ApiBaseResponse(ProductVariantResponseDto, {
    description: 'Cập nhật biến thể thành công',
  })
  @ResponseMessage('Cập nhật biến thể thành công')
  updateVariant(
    @UlidParam('productId') productId: string,
    @UlidParam('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.service.updateVariant(productId, variantId, dto);
  }

  @Delete(':productId/variants/:variantId')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productVariantsDelete',
    summary: 'Xóa biến thể không mặc định và không có tham chiếu',
  })
  @ApiBaseResponse(ProductVariantResponseDto, {
    description: 'Xóa biến thể thành công',
  })
  @ResponseMessage('Xóa biến thể thành công')
  removeVariant(
    @UlidParam('productId') productId: string,
    @UlidParam('variantId') variantId: string,
  ) {
    return this.service.removeVariant(productId, variantId);
  }
}
