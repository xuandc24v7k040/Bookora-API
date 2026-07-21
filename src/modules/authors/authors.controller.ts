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
  AuthorListQueryDto,
  AuthorResponseDto,
  CreateAuthorDto,
  UpdateAuthorDto,
} from './dto';
import { AuthorsService } from './authors.service';
const ApiAuthorErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );
@ApiTags('authors')
@ApiSecurity('accessToken')
@ApiAuthorErrors()
@Controller('authors')
@UseGuards(JwtAccessGuard, CsrfGuard, PermissionsGuard)
export class AuthorsController {
  constructor(private readonly service: AuthorsService) {}
  @Get()
  @Permissions('authors.read')
  @ApiOperation({
    operationId: 'authorsList',
    summary: 'Lấy danh sách tác giả',
  })
  @ApiPaginatedResponse(AuthorResponseDto, 'Lấy danh sách tác giả thành công')
  @ResponseMessage('Lấy danh sách tác giả thành công')
  list(@Query() q: AuthorListQueryDto) {
    return this.service.findAll(q);
  }
  @Get(':id')
  @Permissions('authors.read')
  @ApiOperation({ operationId: 'authorsGet', summary: 'Lấy chi tiết tác giả' })
  @ApiBaseResponse(AuthorResponseDto, { description: 'Lấy tác giả thành công' })
  @ResponseMessage('Lấy tác giả thành công')
  get(@UlidParam('id') id: string) {
    return this.service.findOne(id);
  }
  @Post()
  @Permissions('authors.create')
  @ApiSecurity('csrf')
  @ApiOperation({ operationId: 'authorsCreate', summary: 'Tạo tác giả' })
  @ApiBaseResponse(AuthorResponseDto, {
    status: 201,
    description: 'Tạo tác giả thành công',
  })
  @ResponseMessage('Tạo tác giả thành công')
  create(@Body() dto: CreateAuthorDto) {
    return this.service.create(dto);
  }
  @Patch(':id')
  @Permissions('authors.update')
  @ApiSecurity('csrf')
  @ApiOperation({ operationId: 'authorsUpdate', summary: 'Cập nhật tác giả' })
  @ApiBaseResponse(AuthorResponseDto, {
    description: 'Cập nhật tác giả thành công',
  })
  @ResponseMessage('Cập nhật tác giả thành công')
  update(@UlidParam('id') id: string, @Body() dto: UpdateAuthorDto) {
    return this.service.update(id, dto);
  }
  @Delete(':id')
  @Permissions('authors.delete')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'authorsDelete',
    summary: 'Xóa tác giả chưa được sử dụng',
  })
  @ApiBaseResponse(AuthorResponseDto, { description: 'Xóa tác giả thành công' })
  @ResponseMessage('Xóa tác giả thành công')
  remove(@UlidParam('id') id: string) {
    return this.service.remove(id);
  }
}
