import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { SupportTicket } from '@/generated/prisma/client';

export const SUPPORT_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const SUPPORT_MAX_FILES = 5;
export const SUPPORT_MAX_TEXT = 4000;
export type SupportPermission =
  | 'support.read'
  | 'support.claim'
  | 'support.reply'
  | 'support.manage';

export function hasSupportPermission(
  actor: AuthenticatedUser,
  branchId: string,
  permission: SupportPermission,
): boolean {
  return (
    actor.type === 'BRANCH' &&
    actor.branchAssignments.some(
      (a) =>
        a.branchId === branchId &&
        a.isActive &&
        a.permissions.includes(permission),
    )
  );
}

export function canReadSupport(
  actor: AuthenticatedUser,
  ticket: Pick<SupportTicket, 'customerId' | 'branchId'>,
): boolean {
  return actor.type === 'CUSTOMER'
    ? actor.id === ticket.customerId
    : hasSupportPermission(actor, ticket.branchId, 'support.read');
}

export function supportNotFound(): never {
  throw new NotFoundException({
    code: 'SUPPORT_TICKET_NOT_FOUND',
    message: 'Không tìm thấy yêu cầu hỗ trợ.',
  });
}

export function supportForbidden(): never {
  throw new ForbiddenException({
    code: 'SUPPORT_FORBIDDEN',
    message: 'Bạn không có quyền thực hiện thao tác hỗ trợ này.',
  });
}

export function supportConflict(code: string, ticketId?: string): never {
  throw new ConflictException({
    code,
    message: 'Hội thoại đã thay đổi. Vui lòng tải lại và thử lại.',
    ...(ticketId ? { ticketId } : {}),
  });
}

export function supportInvalid(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

export function supportScope(
  ticket: Pick<SupportTicket, 'type' | 'customerId' | 'branchId' | 'orderId'>,
): string {
  return JSON.stringify([
    ticket.type,
    ticket.customerId,
    ticket.type === 'ORDER' ? ticket.orderId : ticket.branchId,
  ]);
}

export function assertSupportReply(
  actor: AuthenticatedUser,
  ticket: SupportTicket,
): void {
  if (ticket.status === 'RESOLVED')
    supportConflict('SUPPORT_TICKET_RESOLVED', ticket.id);
  if (actor.type === 'CUSTOMER' && actor.id === ticket.customerId) return;
  if (
    !hasSupportPermission(actor, ticket.branchId, 'support.read') ||
    !hasSupportPermission(actor, ticket.branchId, 'support.reply') ||
    ticket.assigneeId !== actor.id ||
    ticket.status !== 'IN_PROGRESS'
  )
    supportForbidden();
}
