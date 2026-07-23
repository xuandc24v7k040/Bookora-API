import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Res,
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
import type { Response } from 'express';
import { ApiBaseResponse, ResponseMessage } from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { CustomerAccountService } from './customer-account.service';
import {
  ChangeCustomerPasswordDto,
  CustomerPasswordChangedResponseDto,
  CustomerProfileResponseDto,
  UpdateCustomerProfileDto,
} from './dto';

const ApiCustomerAccountErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409, 413, 415, 503].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('customer-account')
@ApiSecurity('accessToken')
@ApiCustomerAccountErrors()
@Controller('account')
@UseGuards(JwtAccessGuard, CsrfGuard)
export class CustomerAccountController {
  constructor(private readonly service: CustomerAccountService) {}

  @Get('profile')
  @ApiOperation({
    operationId: 'customerAccountProfile',
    summary: 'Lấy hồ sơ khách hàng hiện tại',
  })
  @ApiBaseResponse(CustomerProfileResponseDto, {
    description: 'Lấy hồ sơ khách hàng thành công',
  })
  @ResponseMessage('Lấy hồ sơ khách hàng thành công')
  profile(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.profile(actor);
  }

  @Patch('profile')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerAccountUpdateProfile',
    summary: 'Cập nhật hồ sơ khách hàng',
    description:
      'Email là thông tin chỉ đọc và không được nhận trong payload cập nhật.',
  })
  @ApiBaseResponse(CustomerProfileResponseDto, {
    description: 'Cập nhật hồ sơ khách hàng thành công',
  })
  @ResponseMessage('Cập nhật hồ sơ khách hàng thành công')
  updateProfile(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.service.updateProfile(actor, dto);
  }

  @Put('avatar')
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
    operationId: 'customerAccountUploadAvatar',
    summary: 'Tải hoặc thay ảnh đại diện',
  })
  @ApiBaseResponse(CustomerProfileResponseDto, {
    description: 'Cập nhật ảnh đại diện thành công',
  })
  @ResponseMessage('Cập nhật ảnh đại diện thành công')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 6 * 1024 * 1024, files: 1 },
    }),
  )
  uploadAvatar(
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'CUSTOMER_AVATAR_REQUIRED',
        message: 'Vui lòng chọn một tệp ảnh',
      });
    }
    return this.service.uploadAvatar(actor, file);
  }

  @Delete('avatar')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerAccountRemoveAvatar',
    summary: 'Gỡ ảnh đại diện',
  })
  @ApiBaseResponse(CustomerProfileResponseDto, {
    description: 'Gỡ ảnh đại diện thành công',
  })
  @ResponseMessage('Gỡ ảnh đại diện thành công')
  removeAvatar(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.removeAvatar(actor);
  }

  @Post('change-password')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerAccountChangePassword',
    summary: 'Đổi mật khẩu khách hàng',
  })
  @ApiBaseResponse(CustomerPasswordChangedResponseDto, {
    description: 'Đổi mật khẩu thành công',
  })
  @ResponseMessage('Đổi mật khẩu thành công')
  changePassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: ChangeCustomerPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.service.changePassword(actor, dto, response);
  }
}
