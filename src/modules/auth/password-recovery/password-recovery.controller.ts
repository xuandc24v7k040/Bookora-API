import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiBaseResponse, ResponseMessage } from '@/common/decorators';
import authConfig from '@/config/auth.config';
import { AuthThrottlerGuard } from '../guards/auth-throttler.guard';
import { CsrfGuard } from '../guards/csrf.guard';
import { TurnstileService } from '../turnstile.service';
import {
  ForgotPasswordDto,
  ForgotPasswordResponseDto,
  ResetPasswordDto,
  ResetPasswordResponseDto,
  ValidateResetTokenDto,
  ValidateResetTokenResponseDto,
} from './dto/password-recovery.dto';
import { PasswordRecoveryService } from './password-recovery.service';

const forgotThrottle = authConfig().throttle.forgotPassword;
const ApiPasswordRecoveryErrors = () =>
  applyDecorators(
    ...[400, 403, 404, 409, 429, 503].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('auth')
@ApiPasswordRecoveryErrors()
@Controller('auth')
@UseGuards(AuthThrottlerGuard)
export class PasswordRecoveryController {
  constructor(
    private readonly service: PasswordRecoveryService,
    private readonly turnstileService: TurnstileService,
  ) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @Throttle({
    default: {
      limit: forgotThrottle.limit,
      ttl: forgotThrottle.ttlSeconds * 1000,
    },
  })
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'authForgotPassword',
    summary: 'Yêu cầu liên kết đặt lại mật khẩu',
    description:
      'Public CUSTOMER flow. Email chưa đăng ký và GOOGLE provider trả machine code riêng theo quyết định sản phẩm.',
  })
  @ApiBaseResponse(ForgotPasswordResponseDto, {
    description: 'Yêu cầu được tiếp nhận',
  })
  @ApiResponse({
    status: 404,
    description: 'Email chưa được đăng ký trong hệ thống',
    schema: {
      example: {
        statusCode: 404,
        code: 'PASSWORD_RESET_EMAIL_NOT_FOUND',
        message: 'Email này chưa được đăng ký trong hệ thống.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Tài khoản dùng Google, không có mật khẩu Bookora',
    schema: {
      example: {
        statusCode: 400,
        code: 'PASSWORD_RESET_UNSUPPORTED_GOOGLE_PROVIDER',
        message:
          'Tài khoản này đăng nhập bằng Google và không sử dụng mật khẩu Bookora.',
      },
    },
  })
  @ResponseMessage('Yêu cầu đặt lại mật khẩu đã được tiếp nhận')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    await this.turnstileService.verifyToken(
      dto.turnstileToken,
      ip,
      'passwordReset',
    );
    return this.service.forgotPassword(dto.email, ip);
  }

  @Post('reset-password/validate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'authValidateResetPasswordToken',
    summary: 'Xác minh trạng thái liên kết đặt lại mật khẩu',
    description:
      'Không consume token và không trả thông tin nhận dạng tài khoản.',
  })
  @ApiBaseResponse(ValidateResetTokenResponseDto, {
    description: 'Liên kết còn hiệu lực',
  })
  @ResponseMessage('Liên kết đặt lại mật khẩu hợp lệ')
  validateToken(@Body() dto: ValidateResetTokenDto) {
    return this.service.validateToken(dto.token);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'authResetPassword',
    summary: 'Đặt lại mật khẩu bằng token một lần',
    description:
      'Consume token, đổi mật khẩu, revoke toàn bộ AuthSession và clear cookie; không tự đăng nhập.',
  })
  @ApiBaseResponse(ResetPasswordResponseDto, {
    description: 'Đặt lại mật khẩu thành công',
  })
  @ResponseMessage('Đặt lại mật khẩu thành công')
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.service.resetPassword(dto.token, dto.newPassword, response);
  }

  private getClientIp(req: Request): string {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  }
}
