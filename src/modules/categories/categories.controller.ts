import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
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
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { Permissions, PermissionsGuard } from '@/modules/authorization';
import { CategoriesService } from './categories.service';
import {
  CategoriesTreeQueryDto,
  CategoryResponseDto,
  CategoryTreeNodeResponseDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto';

const ApiCategoryErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('categories')
@ApiSecurity('accessToken')
@ApiCategoryErrors()
@Controller('categories')
@UseGuards(JwtAccessGuard, CsrfGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('tree')
  @Permissions('categories.read')
  @ApiOperation({
    operationId: 'categoriesTree',
    summary: 'Lấy cây danh mục quản trị',
  })
  @ApiBaseResponse(CategoryTreeNodeResponseDto, {
    description: 'Lấy cây danh mục thành công',
    isArray: true,
  })
  @ResponseMessage('Lấy cây danh mục thành công')
  tree(@Query() query: CategoriesTreeQueryDto) {
    return this.categoriesService.findTree(query);
  }

  @Get(':id')
  @Permissions('categories.read')
  @ApiOperation({
    operationId: 'categoriesGet',
    summary: 'Lấy chi tiết danh mục',
  })
  @ApiBaseResponse(CategoryResponseDto, {
    description: 'Lấy chi tiết danh mục thành công',
  })
  @ResponseMessage('Lấy chi tiết danh mục thành công')
  get(@UlidParam('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Permissions('categories.create')
  @ApiSecurity('csrf')
  @ApiOperation({ operationId: 'categoriesCreate', summary: 'Tạo danh mục' })
  @ApiBaseResponse(CategoryResponseDto, {
    status: 201,
    description: 'Tạo danh mục thành công',
  })
  @ResponseMessage('Tạo danh mục thành công')
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @Permissions('categories.update')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'categoriesUpdate',
    summary: 'Cập nhật danh mục',
  })
  @ApiBaseResponse(CategoryResponseDto, {
    description: 'Cập nhật danh mục thành công',
  })
  @ResponseMessage('Cập nhật danh mục thành công')
  update(@UlidParam('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Put(':id/image')
  @Permissions('categories.update')
  @ApiSecurity('csrf')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    operationId: 'categoriesUploadImage',
    summary: 'Tải hoặc thay ảnh danh mục',
  })
  @ApiBaseResponse(CategoryResponseDto, {
    description: 'Cập nhật ảnh danh mục thành công',
  })
  @ResponseMessage('Cập nhật ảnh danh mục thành công')
  @UseInterceptors(
    FileInterceptor('file', {
      // Keep the transport ceiling above the business limit so the image
      // service can return the stable CATEGORY_IMAGE_TOO_LARGE code.
      limits: { fileSize: 6 * 1024 * 1024, files: 1 },
    }),
  )
  uploadImage(
    @UlidParam('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'CATEGORY_IMAGE_REQUIRED',
        message: 'Vui lòng chọn một tệp ảnh',
      });
    }
    return this.categoriesService.uploadImage(id, file);
  }

  @Delete(':id/image')
  @Permissions('categories.update')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'categoriesRemoveImage',
    summary: 'Gỡ ảnh danh mục',
  })
  @ApiBaseResponse(CategoryResponseDto, {
    description: 'Gỡ ảnh danh mục thành công',
  })
  @ResponseMessage('Gỡ ảnh danh mục thành công')
  removeImage(@UlidParam('id') id: string) {
    return this.categoriesService.removeImage(id);
  }

  @Delete(':id')
  @Permissions('categories.delete')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'categoriesDelete',
    summary: 'Xóa vĩnh viễn danh mục trống',
  })
  @ApiBaseResponse(CategoryResponseDto, {
    description: 'Xóa danh mục thành công',
  })
  @ResponseMessage('Xóa danh mục thành công')
  remove(@UlidParam('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
