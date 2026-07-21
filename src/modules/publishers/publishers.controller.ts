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
  CreatePublisherDto,
  PublisherListQueryDto,
  PublisherResponseDto,
  UpdatePublisherDto,
} from './dto';
import { PublishersService } from './publishers.service';
const ApiPublisherErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );
@ApiTags('publishers')
@ApiSecurity('accessToken')
@ApiPublisherErrors()
@Controller('publishers')
@UseGuards(JwtAccessGuard, CsrfGuard, PermissionsGuard)
export class PublishersController {
  constructor(private readonly service: PublishersService) {}
  @Get()
  @Permissions('publishers.read')
  @ApiOperation({
    operationId: 'publishersList',
    summary: 'Lấy danh sách nhà xuất bản',
  })
  @ApiPaginatedResponse(
    PublisherResponseDto,
    'Lấy danh sách nhà xuất bản thành công',
  )
  @ResponseMessage('Lấy danh sách nhà xuất bản thành công')
  list(@Query() q: PublisherListQueryDto) {
    return this.service.findAll(q);
  }
  @Get(':id')
  @Permissions('publishers.read')
  @ApiOperation({
    operationId: 'publishersGet',
    summary: 'Lấy chi tiết nhà xuất bản',
  })
  @ApiBaseResponse(PublisherResponseDto, {
    description: 'Lấy nhà xuất bản thành công',
  })
  @ResponseMessage('Lấy nhà xuất bản thành công')
  get(@UlidParam('id') id: string) {
    return this.service.findOne(id);
  }
  @Post()
  @Permissions('publishers.create')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'publishersCreate',
    summary: 'Tạo nhà xuất bản',
  })
  @ApiBaseResponse(PublisherResponseDto, {
    status: 201,
    description: 'Tạo nhà xuất bản thành công',
  })
  @ResponseMessage('Tạo nhà xuất bản thành công')
  create(@Body() dto: CreatePublisherDto) {
    return this.service.create(dto);
  }
  @Patch(':id')
  @Permissions('publishers.update')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'publishersUpdate',
    summary: 'Cập nhật nhà xuất bản',
  })
  @ApiBaseResponse(PublisherResponseDto, {
    description: 'Cập nhật nhà xuất bản thành công',
  })
  @ResponseMessage('Cập nhật nhà xuất bản thành công')
  update(@UlidParam('id') id: string, @Body() dto: UpdatePublisherDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @Permissions('publishers.delete')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'publishersDelete',
    summary: 'Xóa nhà xuất bản chưa được sử dụng',
  })
  @ApiBaseResponse(PublisherResponseDto, {
    description: 'Xóa nhà xuất bản thành công',
  })
  @ResponseMessage('Xóa nhà xuất bản thành công')
  remove(@UlidParam('id') id: string) {
    return this.service.remove(id);
  }
}
