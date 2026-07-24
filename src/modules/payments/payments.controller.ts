import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IsString, Length } from 'class-validator';
import { ApiBaseResponse } from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  PaymentStatusResponseDto,
  RetryPaymentResponseDto,
} from './dto/payment-response.dto';
import { PaymentsService } from './payments.service';

class RetryPaymentDto {
  @IsString()
  @Length(8, 120)
  idempotencyKey!: string;
}

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get('vnpay/ipn')
  @HttpCode(200)
  @ApiOperation({ operationId: 'vnpayIpn', summary: 'VNPAY IPN callback' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        RspCode: { type: 'string' },
        Message: { type: 'string' },
      },
      required: ['RspCode', 'Message'],
    },
  })
  async ipn(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    response.json(await this.service.handleVnpayIpn(query));
  }

  @Get('vnpay/return')
  @ApiOperation({
    operationId: 'vnpayReturn',
    summary: 'Xác minh chữ ký rồi chuyển về trang kết quả',
  })
  @ApiResponse({
    status: 302,
    description: 'Chuyển hướng về trang kết quả thanh toán.',
  })
  async returnUrl(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    response.redirect(await this.service.buildReturnRedirect(query));
  }

  @Get(':paymentId/status')
  @UseGuards(JwtAccessGuard)
  @ApiSecurity('accessToken')
  @ApiOperation({
    operationId: 'paymentsStatus',
    summary: 'Lấy trạng thái Payment và các VNPAY attempt',
  })
  @ApiBaseResponse(PaymentStatusResponseDto, {
    description: 'Trạng thái thanh toán thuộc khách hàng.',
  })
  status(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
  ) {
    return this.service.getStatus(actor, paymentId);
  }

  @Post(':paymentId/retry')
  @UseGuards(JwtAccessGuard, CsrfGuard)
  @ApiSecurity('accessToken')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'paymentsRetry',
    summary: 'Tạo VNPAY attempt mới và giữ lại tồn kho',
  })
  @ApiBaseResponse(RetryPaymentResponseDto, {
    description: 'Phiên VNPAY mới sau khi kiểm tra lại tồn kho.',
    status: 201,
  })
  retry(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Body() dto: RetryPaymentDto,
    @Req() request: Request,
  ) {
    return this.service.retry(
      actor,
      paymentId,
      dto.idempotencyKey,
      request.ip || request.socket.remoteAddress || '127.0.0.1',
    );
  }

  @Post(':paymentId/query')
  @UseGuards(JwtAccessGuard, CsrfGuard)
  @ApiSecurity('accessToken')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'paymentsQueryProvider',
    summary: 'Đối soát giao dịch gần nhất qua VNPAY QueryDR',
  })
  @ApiResponse({
    status: 201,
    schema: { type: 'object', additionalProperties: true },
  })
  queryProvider(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('paymentId') paymentId: string,
    @Req() request: Request,
  ) {
    return this.service.queryProvider(
      actor,
      paymentId,
      request.ip || request.socket.remoteAddress || '127.0.0.1',
    );
  }
}
