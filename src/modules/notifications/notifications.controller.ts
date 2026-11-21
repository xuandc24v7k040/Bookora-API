import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags, ApiHeader } from '@nestjs/swagger';
import { ApiBaseResponse } from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { NotificationsService } from './notifications.service';
import {
  NotificationsQueryDto,
  NotificationListDto,
  NotificationCountDto,
} from './notifications.dto';

@ApiTags('notifications')
@ApiSecurity('accessToken')
@ApiHeader({
  name: 'X-Branch-Id',
  required: false,
  description: 'Chi nhánh đang chọn cho nhân sự vận hành.',
})
@UseGuards(JwtAccessGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get()
  @ApiOperation({
    operationId: 'notificationsList',
    summary: 'Danh sách thông báo của tôi',
  })
  @ApiBaseResponse(NotificationListDto, { description: 'Danh sách thông báo.' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branch: string | undefined,
    @Query() query: NotificationsQueryDto,
  ) {
    return this.service.list(actor, branch, query);
  }
  @Get('unread-count')
  @ApiOperation({
    operationId: 'notificationsUnreadCount',
    summary: 'Số thông báo chưa đọc',
  })
  @ApiBaseResponse(NotificationCountDto, {
    description: 'Số thông báo chưa đọc.',
  })
  count(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branch: string | undefined,
  ) {
    return this.service.count(actor, branch);
  }
  @Post('read-all')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'notificationsReadAll',
    summary: 'Đánh dấu tất cả đã đọc trong phạm vi hiện tại',
  })
  @ApiBaseResponse(NotificationCountDto, {
    description: 'Số thông báo được đánh dấu đã đọc.',
    status: 201,
  })
  readAll(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branch: string | undefined,
  ) {
    return this.service.markRead(actor, branch);
  }
  @Post(':id/read')
  @UseGuards(CsrfGuard)
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'notificationsRead',
    summary: 'Đánh dấu thông báo đã đọc',
  })
  @ApiBaseResponse(NotificationCountDto, {
    description: 'Số thông báo được đánh dấu đã đọc.',
    status: 201,
  })
  read(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('x-branch-id') branch: string | undefined,
    @Param('id') id: string,
  ) {
    return this.service.markRead(actor, branch, id);
  }
}
