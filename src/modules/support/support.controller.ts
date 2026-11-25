import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiBaseResponse } from '@/common/decorators/api-base-response.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { SupportService } from './support.service';
import { SupportFilesService } from './support-files.service';
import { SupportUploadInterceptor } from './support-upload.interceptor';
import {
  SupportActivityListDto,
  SupportAssigneeListDto,
  SupportAssigneeQueryDto,
  SupportAttachmentDto,
  SupportCreateDto,
  SupportHistoryDto,
  SupportHistoryQueryDto,
  SupportListQueryDto,
  SupportMessageInputDto,
  SupportOrderContextDto,
  SupportReadDto,
  SupportReadResultDto,
  SupportReassignDto,
  SupportSendResultDto,
  SupportTicketDto,
  SupportTicketListDto,
  SupportUnreadDto,
  SupportUploadContextDto,
} from './dto/support.dto';

class SupportUploadBodyDto extends SupportUploadContextDto {
  @ApiProperty({ type: 'string', format: 'binary' }) file!: string;
}

class SupportDiscardResultDto {
  @ApiProperty() id!: string;
}

@ApiTags('support')
@ApiSecurity('accessToken')
@ApiSecurity('csrfHeader')
@Controller('support')
@UseGuards(JwtAccessGuard, CsrfGuard, ThrottlerGuard)
@Throttle({ default: { limit: 180, ttl: 60000 } })
export class SupportController {
  constructor(
    private readonly service: SupportService,
    private readonly files: SupportFilesService,
  ) {}

  @Get('assignees')
  @ApiHeader({ name: 'x-branch-id', required: true })
  @ApiOperation({
    operationId: 'supportAssigneesList',
    summary: 'Nhân viên đủ quyền hỗ trợ tại chi nhánh hiện tại',
  })
  @ApiBaseResponse(SupportAssigneeListDto, {
    description: 'Chỉ ID và tên; cần support.read và support.manage.',
  })
  assignees(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: SupportAssigneeQueryDto,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.assignees(actor, query, branchId);
  }

  @Get('tickets')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportTicketsList',
    summary: 'Hội thoại hỗ trợ trong phạm vi được cấp',
  })
  @ApiBaseResponse(SupportTicketListDto, {
    description: 'Danh sách hội thoại.',
  })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: SupportListQueryDto,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.list(actor, query, branchId);
  }

  @Get('unread')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportUnread',
    summary: 'Số tin hỗ trợ chưa đọc',
  })
  @ApiBaseResponse(SupportUnreadDto, { description: 'Số tin chưa đọc.' })
  unread(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.unread(actor, branchId);
  }

  @Get('orders/:orderId/context')
  @ApiOperation({
    operationId: 'supportOwnedOrderContext',
    summary: 'Tìm hỗ trợ cho đơn hàng của tôi',
  })
  @ApiBaseResponse(SupportOrderContextDto, {
    description: 'Ngữ cảnh đơn hàng thuộc khách.',
  })
  orderContext(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.service.orderContext(actor, orderId);
  }

  @Post('tickets')
  @ApiOperation({
    operationId: 'supportTicketCreate',
    summary: 'Tạo hoặc tái sử dụng hội thoại cùng tin đầu tiên',
  })
  @ApiBaseResponse(SupportSendResultDto, {
    description: 'Tin nhắn đã lưu.',
    status: 201,
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SupportCreateDto,
  ) {
    return this.service.create(actor, dto).then((result) => ({ result }));
  }

  @Get('tickets/:ticketId')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportTicketDetail',
    summary: 'Chi tiết hội thoại',
  })
  @ApiBaseResponse(SupportTicketDto, { description: 'Thông tin hội thoại.' })
  detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.detail(actor, id, branchId);
  }

  @Get('tickets/:ticketId/order-context')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportTicketOrderContext',
    summary: 'Tóm tắt đơn hàng an toàn trong hội thoại',
  })
  @ApiBaseResponse(SupportOrderContextDto, {
    description:
      'Tóm tắt đơn hàng, không có địa chỉ hoặc thông tin thanh toán.',
  })
  ticketOrder(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.ticketOrder(actor, id, branchId);
  }

  @Get('tickets/:ticketId/messages')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportMessagesList',
    summary: 'Lịch sử hoặc delta tin nhắn theo sequence',
  })
  @ApiBaseResponse(SupportHistoryDto, { description: 'Lịch sử tin nhắn.' })
  history(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Query() query: SupportHistoryQueryDto,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.history(actor, id, query, branchId);
  }

  @Post('tickets/:ticketId/messages')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportMessageSend',
    summary: 'Gửi tin nhắn hỗ trợ',
  })
  @ApiBaseResponse(SupportSendResultDto, {
    description: 'Tin nhắn đã lưu.',
    status: 201,
  })
  send(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Body() dto: SupportMessageInputDto,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service
      .send(actor, id, dto, branchId)
      .then((result) => ({ result }));
  }

  @Post('tickets/:ticketId/read')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportTicketRead',
    summary: 'Đánh dấu đã thực sự đọc tới sequence',
  })
  @ApiBaseResponse(SupportReadResultDto, {
    description: 'Mốc đã đọc tăng đơn điệu.',
    status: 201,
  })
  read(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Body() dto: SupportReadDto,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.read(actor, id, dto.lastReadSequence, branchId);
  }

  @Post('tickets/:ticketId/claim')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportTicketClaim',
    summary: 'Tiếp nhận hội thoại nguyên tử',
  })
  @ApiBaseResponse(SupportTicketDto, {
    description: 'Hội thoại sau tiếp nhận.',
    status: 201,
  })
  claim(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.transition(actor, id, 'claim', branchId);
  }

  @Post('tickets/:ticketId/unclaim')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportTicketUnclaim',
    summary: 'Trả hội thoại về chờ tiếp nhận',
  })
  @ApiBaseResponse(SupportTicketDto, {
    description: 'Hội thoại chưa phân công.',
    status: 201,
  })
  unclaim(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.transition(actor, id, 'unclaim', branchId);
  }

  @Post('tickets/:ticketId/reassign')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportTicketReassign',
    summary: 'Quản lý phân công hoặc tiếp quản hội thoại',
  })
  @ApiBaseResponse(SupportTicketDto, {
    description: 'Đã phân công người phụ trách.',
    status: 201,
  })
  reassign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Body() dto: SupportReassignDto,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.transition(
      actor,
      id,
      'reassign',
      branchId,
      dto.assigneeId,
    );
  }

  @Post('tickets/:ticketId/resolve')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportTicketResolve',
    summary: 'Đánh dấu đã giải quyết',
  })
  @ApiBaseResponse(SupportTicketDto, {
    description: 'Hội thoại đã giải quyết.',
    status: 201,
  })
  resolve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.transition(actor, id, 'resolve', branchId);
  }

  @Post('tickets/:ticketId/reopen')
  @ApiOperation({
    operationId: 'supportTicketReopen',
    summary: 'Khách chủ động mở lại hoặc nhận hội thoại active hiện tại',
  })
  @ApiBaseResponse(SupportTicketDto, {
    description: 'Hội thoại tiếp tục hỗ trợ.',
    status: 201,
  })
  reopen(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
  ) {
    return this.service.transition(actor, id, 'reopen');
  }

  @Get('tickets/:ticketId/activities')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportTicketActivities',
    summary: 'Lịch sử tiếp nhận và xử lý hội thoại',
  })
  @ApiBaseResponse(SupportActivityListDto, {
    description: 'Lịch sử thao tác có phân trang.',
  })
  activities(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('ticketId') id: string,
    @Query('cursor') cursor?: string,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.service.activities(actor, id, cursor, branchId);
  }

  @Post('attachments')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(SupportUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SupportUploadBodyDto })
  @ApiOperation({
    operationId: 'supportAttachmentUpload',
    summary:
      'Tải tệp riêng tư vào ngữ cảnh hỗ trợ, hết hạn sau một giờ nếu chưa gửi',
  })
  @ApiBaseResponse(SupportAttachmentDto, {
    description: 'Tệp chờ gắn tin nhắn.',
    status: 201,
  })
  upload(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SupportUploadContextDto,
    @UploadedFile() file?: Express.Multer.File,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.files.upload(actor, dto, file, branchId);
  }

  @Delete('attachments/:attachmentId')
  @ApiOperation({
    operationId: 'supportAttachmentDiscard',
    summary: 'Hủy tệp chưa gửi của chính mình',
  })
  @ApiBaseResponse(SupportDiscardResultDto, {
    description: 'Đã lên lịch xóa tệp.',
  })
  discard(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('attachmentId') id: string,
  ) {
    return this.files.discard(actor, id);
  }

  @Get('attachments/:attachmentId/content')
  @ApiHeader({ name: 'x-branch-id', required: false })
  @ApiOperation({
    operationId: 'supportAttachmentContent',
    summary: 'Tải tệp qua proxy có kiểm tra quyền hiện tại',
  })
  @ApiResponse({
    status: 200,
    description: 'Nội dung tệp riêng tư.',
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  async content(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('attachmentId') id: string,
    @Res() response: Response,
    @Headers('x-branch-id') branchId?: string,
  ) {
    const row = await this.files.download(actor, id, branchId);
    const bytes = await row.body.transformToByteArray();
    response.set({
      'Content-Type': row.mimeType,
      'Content-Length': String(row.size),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Content-Disposition': `${row.mimeType.startsWith('image/') ? 'inline' : 'attachment'}; filename="support-file"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    });
    response.end(Buffer.from(bytes));
  }
}
