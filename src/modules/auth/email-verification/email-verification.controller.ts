import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiBaseResponse, ResponseMessage } from '@/common/decorators';
import { AuthMutationResponseDto } from '../dto/auth-response.dto';
import { AuthThrottlerGuard } from '../guards/auth-throttler.guard';
import { CsrfGuard } from '../guards/csrf.guard';
import {
  ResendVerificationDto,
  ResendVerificationResponseDto,
  VerifyEmailDto,
} from './email-verification.dto';
import { EmailVerificationService } from './email-verification.service';

@ApiTags('auth')
@ApiSecurity('csrf')
@ApiResponse({
  status: 400,
  description: 'Dữ liệu hoặc liên kết không hợp lệ',
  schema: { $ref: '#/components/schemas/ErrorResponseDto' },
})
@ApiResponse({
  status: 403,
  description: 'Phiên bảo mật không hợp lệ',
  schema: { $ref: '#/components/schemas/ErrorResponseDto' },
})
@ApiResponse({
  status: 409,
  description: 'Trạng thái vừa thay đổi, vui lòng thử lại',
  schema: { $ref: '#/components/schemas/ErrorResponseDto' },
})
@ApiResponse({
  status: 429,
  description: 'Quá nhiều yêu cầu',
  schema: { $ref: '#/components/schemas/ErrorResponseDto' },
})
@Controller('auth/email-verification')
@UseGuards(AuthThrottlerGuard, CsrfGuard)
export class EmailVerificationController {
  constructor(private readonly service: EmailVerificationService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'authVerifyEmail',
    summary: 'Xác minh email đăng ký bằng liên kết một lần',
  })
  @ApiBaseResponse(AuthMutationResponseDto, {
    description: 'Email được xác minh, không tạo phiên đăng nhập',
  })
  @ResponseMessage('Xác minh email thành công. Vui lòng đăng nhập.')
  verify(@Body() dto: VerifyEmailDto) {
    return this.service.verify(dto.token);
  }

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 900_000 } })
  @ApiOperation({
    operationId: 'authResendEmailVerification',
    summary: 'Yêu cầu gửi lại email xác minh',
    description:
      'Phản hồi trung tính, không tiết lộ tài khoản tồn tại hay trạng thái gửi thư.',
  })
  @ApiBaseResponse(ResendVerificationResponseDto, {
    description: 'Yêu cầu được tiếp nhận',
  })
  @ResponseMessage('Yêu cầu xác minh email đã được tiếp nhận')
  resend(@Body() dto: ResendVerificationDto, @Req() req: Request) {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    return this.service.resend(
      dto.email,
      ip.startsWith('::ffff:') ? ip.slice(7) : ip,
    );
  }
}
