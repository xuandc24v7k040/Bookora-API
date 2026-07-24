import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { PaymentsService } from './payments.service';

@ApiTags('payment-transactions')
@ApiSecurity('accessToken')
@Controller('payment-transactions')
@UseGuards(JwtAccessGuard, CsrfGuard)
export class PaymentTransactionsController {
  constructor(private readonly service: PaymentsService) {}

  @Post(':transactionId/query')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'paymentTransactionsQuery',
    summary: 'Đối soát một attempt qua VNPAY QueryDR',
  })
  @ApiResponse({
    status: 201,
    schema: { type: 'object', additionalProperties: true },
  })
  query(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('transactionId') transactionId: string,
    @Req() request: Request,
  ) {
    return this.service.queryProviderTransaction(
      actor,
      transactionId,
      request.ip || request.socket.remoteAddress || '127.0.0.1',
    );
  }
}
