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
  ApiPaginatedResponse,
  ResponseMessage,
  UlidParam,
} from '@/common/decorators';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { Permissions, PermissionsGuard } from '@/modules/authorization';
import {
  CreateProductAttributeDto,
  ProductAttributeListQueryDto,
  ProductAttributeResponseDto,
  UpdateProductAttributeDto,
} from './dto';
import { ProductAttributesService } from './product-attributes.service';
const ApiProductAttributeErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );
@ApiTags('product-attributes')
@ApiSecurity('accessToken')
@ApiProductAttributeErrors()
@Controller('product-attributes')
@UseGuards(JwtAccessGuard, CsrfGuard, PermissionsGuard)
export class ProductAttributesController {
  constructor(private readonly service: ProductAttributesService) {}
  @Get()
  @Permissions('product_attributes.read')
  @ApiOperation({
    operationId: 'productAttributesList',
    summary: 'Lấy danh sách thuộc tính sản phẩm',
  })
  @ApiPaginatedResponse(
    ProductAttributeResponseDto,
    'Lấy danh sách thuộc tính sản phẩm thành công',
  )
  @ResponseMessage('Lấy danh sách thuộc tính sản phẩm thành công')
  list(@Query() q: ProductAttributeListQueryDto) {
    return this.service.findAll(q);
  }
  @Get(':id')
  @Permissions('product_attributes.read')
  @ApiOperation({
    operationId: 'productAttributesGet',
    summary: 'Lấy chi tiết thuộc tính sản phẩm',
  })
  @ApiBaseResponse(ProductAttributeResponseDto, {
    description: 'Lấy thuộc tính sản phẩm thành công',
  })
  @ResponseMessage('Lấy thuộc tính sản phẩm thành công')
  get(@UlidParam('id') id: string) {
    return this.service.findOne(id);
  }
  @Post()
  @Permissions('product_attributes.create')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productAttributesCreate',
    summary: 'Tạo thuộc tính sản phẩm',
  })
  @ApiBaseResponse(ProductAttributeResponseDto, {
    status: 201,
    description: 'Tạo thuộc tính sản phẩm thành công',
  })
  @ResponseMessage('Tạo thuộc tính sản phẩm thành công')
  create(@Body() dto: CreateProductAttributeDto) {
    return this.service.create(dto);
  }
  @Patch(':id')
  @Permissions('product_attributes.update')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productAttributesUpdate',
    summary: 'Cập nhật thuộc tính sản phẩm',
  })
  @ApiBaseResponse(ProductAttributeResponseDto, {
    description: 'Cập nhật thuộc tính sản phẩm thành công',
  })
  @ResponseMessage('Cập nhật thuộc tính sản phẩm thành công')
  update(@UlidParam('id') id: string, @Body() dto: UpdateProductAttributeDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @Permissions('product_attributes.delete')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productAttributesDelete',
    summary: 'Xóa thuộc tính sản phẩm chưa được sử dụng',
  })
  @ApiBaseResponse(ProductAttributeResponseDto, {
    description: 'Xóa thuộc tính sản phẩm thành công',
  })
  @ResponseMessage('Xóa thuộc tính sản phẩm thành công')
  remove(@UlidParam('id') id: string) {
    return this.service.remove(id);
  }
}
