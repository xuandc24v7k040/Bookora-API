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
import { Permissions, PermissionsGuard } from '@/modules/authorization';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import {
  OptionValueImageResponseDto,
  ProductMediaQueryDto,
  ProductMediaResponseDto,
  ReorderProductMediaDto,
  UpdateProductMediaDto,
  UploadProductMediaDto,
} from './dto';
import { IMAGE_UPLOAD_TRANSPORT_MAX_BYTES } from './product-media.constants';
import { ProductMediaService } from './product-media.service';

const ApiProductMediaErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409, 413, 415, 502, 503].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

const ProductImageUpload = () =>
  applyDecorators(
    ApiConsumes('multipart/form-data'),
    UseInterceptors(
      FileInterceptor('file', {
        limits: { fileSize: IMAGE_UPLOAD_TRANSPORT_MAX_BYTES, files: 1 },
      }),
    ),
  );

@ApiTags('product-media')
@ApiSecurity('accessToken')
@ApiProductMediaErrors()
@Controller('products/:productId')
@UseGuards(JwtAccessGuard, PermissionsGuard)
export class ProductMediaController {
  constructor(private readonly service: ProductMediaService) {}

  @Get('media')
  @Permissions('products.read')
  @ApiOperation({
    operationId: 'productMediaList',
    summary: 'Lấy bộ sưu tập ảnh chung hoặc ảnh riêng của biến thể',
  })
  @ApiBaseResponse(ProductMediaResponseDto, {
    isArray: true,
    description: 'Lấy bộ sưu tập ảnh thành công',
  })
  @ResponseMessage('Lấy bộ sưu tập ảnh thành công')
  list(
    @UlidParam('productId') productId: string,
    @Query() query: ProductMediaQueryDto,
  ) {
    return this.service.list(productId, query.variantId);
  }

  @Post('media')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ProductImageUpload()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        variantId: { type: 'string', format: 'ulid' },
        altText: { type: 'string', maxLength: 200 },
        isPrimary: { type: 'boolean' },
      },
    },
  })
  @ApiOperation({
    operationId: 'productMediaUpload',
    summary: 'Tải một ảnh vào bộ sưu tập sản phẩm',
  })
  @ApiBaseResponse(ProductMediaResponseDto, {
    status: 201,
    description: 'Tải ảnh sản phẩm thành công',
  })
  @ResponseMessage('Tải ảnh sản phẩm thành công')
  upload(
    @UlidParam('productId') productId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadProductMediaDto,
  ) {
    if (!file) this.imageRequired();
    return this.service.upload(productId, file, dto);
  }

  @Patch('media/:mediaId')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productMediaUpdate',
    summary: 'Cập nhật mô tả ảnh sản phẩm',
  })
  @ApiBaseResponse(ProductMediaResponseDto, {
    description: 'Cập nhật mô tả ảnh thành công',
  })
  @ResponseMessage('Cập nhật mô tả ảnh thành công')
  update(
    @UlidParam('productId') productId: string,
    @UlidParam('mediaId') mediaId: string,
    @Body() dto: UpdateProductMediaDto,
  ) {
    return this.service.updateAltText(productId, mediaId, dto);
  }

  @Patch('media/:mediaId/primary')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productMediaSetPrimary',
    summary: 'Đặt ảnh đại diện atomically trong đúng bộ sưu tập',
  })
  @ApiBaseResponse(ProductMediaResponseDto, {
    description: 'Đặt ảnh đại diện thành công',
  })
  @ResponseMessage('Đặt ảnh đại diện thành công')
  setPrimary(
    @UlidParam('productId') productId: string,
    @UlidParam('mediaId') mediaId: string,
  ) {
    return this.service.setPrimary(productId, mediaId);
  }

  @Put('media/reorder')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productMediaReorder',
    summary: 'Lưu thứ tự đầy đủ của một bộ sưu tập',
  })
  @ApiBaseResponse(ProductMediaResponseDto, {
    isArray: true,
    description: 'Lưu thứ tự ảnh thành công',
  })
  @ResponseMessage('Lưu thứ tự ảnh thành công')
  reorder(
    @UlidParam('productId') productId: string,
    @Body() dto: ReorderProductMediaDto,
  ) {
    return this.service.reorder(productId, dto);
  }

  @Delete('media/:mediaId')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productMediaDelete',
    summary: 'Xóa ảnh và tự chuyển ảnh đại diện khi cần',
  })
  @ApiBaseResponse(ProductMediaResponseDto, {
    description: 'Xóa ảnh sản phẩm thành công',
  })
  @ResponseMessage('Xóa ảnh sản phẩm thành công')
  remove(
    @UlidParam('productId') productId: string,
    @UlidParam('mediaId') mediaId: string,
  ) {
    return this.service.remove(productId, mediaId);
  }

  @Put('options/:optionId/values/:optionValueId/image')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ProductImageUpload()
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    operationId: 'productOptionValueImageUpload',
    summary: 'Tải hoặc thay thumbnail của giá trị lựa chọn',
  })
  @ApiBaseResponse(OptionValueImageResponseDto, {
    description: 'Cập nhật thumbnail thành công',
  })
  @ResponseMessage('Cập nhật thumbnail thành công')
  uploadOptionValueImage(
    @UlidParam('productId') productId: string,
    @UlidParam('optionId') optionId: string,
    @UlidParam('optionValueId') optionValueId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) this.imageRequired();
    return this.service.uploadOptionValueImage(
      productId,
      optionId,
      optionValueId,
      file,
    );
  }

  @Delete('options/:optionId/values/:optionValueId/image')
  @Permissions('products.update')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'productOptionValueImageRemove',
    summary: 'Gỡ thumbnail của giá trị lựa chọn',
  })
  @ApiBaseResponse(OptionValueImageResponseDto, {
    description: 'Gỡ thumbnail thành công',
  })
  @ResponseMessage('Gỡ thumbnail thành công')
  removeOptionValueImage(
    @UlidParam('productId') productId: string,
    @UlidParam('optionId') optionId: string,
    @UlidParam('optionValueId') optionValueId: string,
  ) {
    return this.service.removeOptionValueImage(
      productId,
      optionId,
      optionValueId,
    );
  }

  private imageRequired(): never {
    throw new BadRequestException({
      code: 'PRODUCT_MEDIA_INVALID_FILE',
      message: 'Vui lòng chọn một tệp ảnh',
    });
  }
}
