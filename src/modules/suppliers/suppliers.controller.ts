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
  CreateSupplierDto,
  SupplierListQueryDto,
  SupplierResponseDto,
  UpdateSupplierDto,
} from './dto';
import { SuppliersService } from './suppliers.service';

const ApiSupplierErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('suppliers')
@ApiSecurity('accessToken')
@ApiSupplierErrors()
@Controller('suppliers')
@UseGuards(JwtAccessGuard, CsrfGuard, PermissionsGuard)
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}
  @Get()
  @Permissions('suppliers.read')
  @ApiOperation({
    operationId: 'suppliersList',
    summary: 'Lấy danh sách nhà cung cấp',
  })
  @ApiPaginatedResponse(
    SupplierResponseDto,
    'Lấy danh sách nhà cung cấp thành công',
  )
  @ResponseMessage('Lấy danh sách nhà cung cấp thành công')
  list(@Query() query: SupplierListQueryDto) {
    return this.service.findAll(query);
  }
  @Get(':id')
  @Permissions('suppliers.read')
  @ApiOperation({
    operationId: 'suppliersGet',
    summary: 'Lấy chi tiết nhà cung cấp',
  })
  @ApiBaseResponse(SupplierResponseDto, {
    description: 'Lấy nhà cung cấp thành công',
  })
  @ResponseMessage('Lấy nhà cung cấp thành công')
  get(@UlidParam('id') id: string) {
    return this.service.findOne(id);
  }
  @Post()
  @Permissions('suppliers.create')
  @ApiSecurity('csrf')
  @ApiOperation({ operationId: 'suppliersCreate', summary: 'Tạo nhà cung cấp' })
  @ApiBaseResponse(SupplierResponseDto, {
    status: 201,
    description: 'Tạo nhà cung cấp thành công',
  })
  @ResponseMessage('Tạo nhà cung cấp thành công')
  create(@Body() dto: CreateSupplierDto) {
    return this.service.create(dto);
  }
  @Patch(':id')
  @Permissions('suppliers.update')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'suppliersUpdate',
    summary: 'Cập nhật nhà cung cấp',
  })
  @ApiBaseResponse(SupplierResponseDto, {
    description: 'Cập nhật nhà cung cấp thành công',
  })
  @ResponseMessage('Cập nhật nhà cung cấp thành công')
  update(@UlidParam('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @Permissions('suppliers.delete')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'suppliersDelete',
    summary: 'Xóa nhà cung cấp chưa được sử dụng',
  })
  @ApiBaseResponse(SupplierResponseDto, {
    description: 'Xóa nhà cung cấp thành công',
  })
  @ResponseMessage('Xóa nhà cung cấp thành công')
  remove(@UlidParam('id') id: string) {
    return this.service.remove(id);
  }
}
