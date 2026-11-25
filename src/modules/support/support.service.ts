import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type SupportTicket } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  SupportRepository,
  supportMessageDto,
  supportMessageInclude,
  type SupportTx,
} from './support.repository';
import { SupportRealtimeService } from './support-realtime.service';
import {
  assertSupportReply,
  canReadSupport,
  hasSupportPermission,
  supportConflict,
  supportForbidden,
  supportInvalid,
  supportNotFound,
  supportScope,
} from './support.policy';
import type {
  SupportContextDto,
  SupportAssigneeQueryDto,
  SupportCreateDto,
  SupportHistoryQueryDto,
  SupportListQueryDto,
  SupportMessageInputDto,
} from './dto/support.dto';

@Injectable()
export class SupportService {
  constructor(
    private readonly repository: SupportRepository,
    private readonly realtime: SupportRealtimeService,
  ) {}

  async context(
    actor: AuthenticatedUser,
    dto: SupportContextDto,
    tx: SupportTx = this.repository.prisma,
  ) {
    if (actor.type !== 'CUSTOMER') supportForbidden();
    let branchId = dto.branchId;
    let orderId: string | null = null;
    if (dto.type === 'ORDER') {
      const order = await tx.order.findFirst({
        where: { id: dto.orderId ?? '', userId: actor.id },
        select: { id: true, branchId: true },
      });
      if (!order) supportNotFound();
      branchId = order.branchId;
      orderId = order.id;
    } else if (dto.orderId)
      supportInvalid(
        'SUPPORT_CONTEXT_INVALID',
        'Tư vấn chung không gắn đơn hàng.',
      );
    const branch = await tx.branch.findFirst({
      where: { id: branchId ?? '', isActive: true },
      select: { id: true },
    });
    if (!branch)
      supportInvalid(
        'SUPPORT_BRANCH_UNAVAILABLE',
        'Chi nhánh hiện không tiếp nhận yêu cầu mới.',
      );
    return {
      type: dto.type,
      customerId: actor.id,
      branchId: branch.id,
      orderId,
    };
  }

  async ticket(
    actor: AuthenticatedUser,
    id: string,
    branchId?: string,
    tx: SupportTx = this.repository.prisma,
  ): Promise<SupportTicket> {
    const ticket = await tx.supportTicket.findUnique({ where: { id } });
    if (
      !ticket ||
      !canReadSupport(actor, ticket) ||
      (actor.type === 'BRANCH' && ticket.branchId !== branchId)
    )
      supportNotFound();
    return ticket;
  }

  private scopeWhere(
    scope: Pick<SupportTicket, 'type' | 'customerId' | 'branchId' | 'orderId'>,
  ): Prisma.SupportTicketWhereInput {
    return {
      customerId: scope.customerId,
      type: scope.type,
      ...(scope.type === 'ORDER'
        ? { orderId: scope.orderId }
        : { branchId: scope.branchId }),
      status: { in: ['OPEN', 'IN_PROGRESS'] },
    };
  }

  private fingerprint(
    scope: string,
    dto: SupportMessageInputDto,
    subject?: string,
  ) {
    return createHash('sha256')
      .update(
        JSON.stringify([
          scope,
          subject ?? null,
          dto.text?.trim() || null,
          [...(dto.attachmentIds ?? [])].sort(),
          // Keep historical non-reply idempotency hashes unchanged.
          ...(dto.replyToMessageId ? [dto.replyToMessageId] : []),
        ]),
      )
      .digest('hex');
  }

  private async replay(
    tx: SupportTx,
    actor: AuthenticatedUser,
    dto: SupportMessageInputDto,
    hash: string,
  ) {
    const message = await tx.supportMessage.findUnique({
      where: {
        senderUserId_clientMessageId: {
          senderUserId: actor.id,
          clientMessageId: dto.clientMessageId,
        },
      },
      include: supportMessageInclude,
    });
    if (!message) return null;
    if (message.payloadHash !== hash)
      supportConflict('SUPPORT_MESSAGE_REPLAY_CONFLICT');
    return {
      ticketId: message.ticketId,
      message: supportMessageDto(message),
      replayed: true,
    };
  }

  private async append(
    tx: SupportTx,
    actor: AuthenticatedUser,
    ticket: SupportTicket,
    dto: SupportMessageInputDto,
    hash: string,
  ) {
    assertSupportReply(actor, ticket);
    if (dto.replyToMessageId) {
      const original = await tx.supportMessage.findFirst({
        where: { id: dto.replyToMessageId, ticketId: ticket.id },
        select: { id: true },
      });
      if (!original)
        supportInvalid(
          'SUPPORT_REPLY_INVALID',
          'Tin nhắn được trả lời không thuộc hội thoại này.',
        );
    }
    const text = dto.text?.trim() || null;
    const ids = dto.attachmentIds ?? [];
    if (!text && !ids.length)
      supportInvalid(
        'SUPPORT_MESSAGE_EMPTY',
        'Vui lòng nhập tin nhắn hoặc chọn tệp đính kèm.',
      );
    if (ids.length > 5 || new Set(ids).size !== ids.length)
      supportInvalid(
        'SUPPORT_TOO_MANY_ATTACHMENTS',
        'Mỗi tin nhắn tối đa 5 tệp.',
      );
    if (text && Array.from(text).length > 4000)
      supportInvalid(
        'SUPPORT_MESSAGE_TOO_LONG',
        'Tin nhắn tối đa 4.000 ký tự.',
      );
    // Lock staged rows against expiry cleanup/finalization by another request.
    if (ids.length)
      await tx.$queryRaw`SELECT id FROM support_attachments WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    const attachments = await tx.supportAttachment.findMany({
      where: {
        id: { in: ids },
        ownerId: actor.id,
        scopeKey: supportScope(ticket),
        ready: true,
        messageId: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (attachments.length !== ids.length)
      supportInvalid(
        'SUPPORT_ATTACHMENT_INVALID',
        'Tệp đính kèm không hợp lệ hoặc đã hết hạn.',
      );
    const updated = await tx.supportTicket.update({
      where: { id: ticket.id },
      data: { lastSequence: { increment: 1 }, version: { increment: 1 } },
    });
    const message = await tx.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderUserId: actor.id,
        senderType: actor.type,
        clientMessageId: dto.clientMessageId,
        payloadHash: hash,
        text,
        replyToMessageId: dto.replyToMessageId ?? null,
        sequence: updated.lastSequence,
        attachments: { connect: ids.map((id) => ({ id })) },
      },
      include: supportMessageInclude,
    });
    return {
      ticketId: ticket.id,
      message: supportMessageDto(message),
      replayed: false,
    };
  }

  async create(actor: AuthenticatedUser, dto: SupportCreateDto) {
    if (dto.message.replyToMessageId)
      supportInvalid(
        'SUPPORT_REPLY_INVALID',
        'Không thể trả lời tin nhắn khi tạo yêu cầu mới.',
      );
    const started = performance.now();
    const result = await this.repository.prisma.$transaction(
      async (tx) => {
        const scope = await this.context(actor, dto, tx);
        const key = supportScope(scope);
        // Idempotency lock precedes scope/ticket locks consistently across send paths.
        await this.repository.lockScope(
          tx,
          `message:${actor.id}:${dto.message.clientMessageId}`,
        );
        await this.repository.lockScope(tx, key);
        const hash = this.fingerprint(key, dto.message, dto.subject);
        const replay = await this.replay(tx, actor, dto.message, hash);
        if (replay) return replay;
        let ticket = await tx.supportTicket.findFirst({
          where: this.scopeWhere(scope),
        });
        if (ticket) ticket = await this.repository.lockTicket(tx, ticket.id);
        else {
          ticket = await tx.supportTicket.create({
            data: { ...scope, subject: dto.subject?.trim() || null },
          });
          await this.activity(tx, actor, ticket, 'CREATE', null, 'OPEN', null);
        }
        return this.append(tx, actor, ticket, dto.message, hash);
      },
      { timeout: 15000 },
    );
    const committed = performance.now();
    if (!result.replayed) this.realtime.message(result, started, committed);
    return result;
  }

  async send(
    actor: AuthenticatedUser,
    id: string,
    dto: SupportMessageInputDto,
    branchId?: string,
  ) {
    const started = performance.now();
    const result = await this.repository.prisma.$transaction(
      async (tx) => {
        await this.repository.lockScope(
          tx,
          `message:${actor.id}:${dto.clientMessageId}`,
        );
        const ticket = await this.repository.lockTicket(tx, id);
        await this.ticket(actor, id, branchId, tx);
        const hash = this.fingerprint(`ticket:${id}`, dto);
        const replay = await this.replay(tx, actor, dto, hash);
        if (replay) {
          // A revoked/non-assigned staff cannot use replay to recover protected content.
          if (actor.type === 'BRANCH') assertSupportReply(actor, ticket);
          return replay;
        }
        return this.append(tx, actor, ticket, dto, hash);
      },
      { timeout: 15000 },
    );
    const committed = performance.now();
    if (!result.replayed) this.realtime.message(result, started, committed);
    return result;
  }

  private listScope(
    actor: AuthenticatedUser,
    branchId?: string,
  ): Prisma.SupportTicketWhereInput {
    if (actor.type === 'CUSTOMER') return { customerId: actor.id };
    if (!branchId || !hasSupportPermission(actor, branchId, 'support.read'))
      supportForbidden();
    return { branchId };
  }

  async list(
    actor: AuthenticatedUser,
    query: SupportListQueryDto,
    branchId?: string,
  ) {
    const where: Prisma.SupportTicketWhereInput = {
      ...this.listScope(actor, branchId),
      status: query.status,
      type: query.type,
      orderId: query.orderId,
    };
    if (query.branchId) {
      if (actor.type === 'BRANCH' && query.branchId !== branchId)
        supportForbidden();
      where.branchId = query.branchId;
    }
    if (query.query)
      where.OR = [
        { subject: { contains: query.query, mode: 'insensitive' } },
        {
          customer: {
            fullName: { contains: query.query, mode: 'insensitive' },
          },
        },
        {
          order: { orderCode: { contains: query.query, mode: 'insensitive' } },
        },
        {
          messages: {
            some: { text: { contains: query.query, mode: 'insensitive' } },
          },
        },
      ];
    if (query.cursor) {
      let cursor: { time?: unknown; id?: unknown };
      try {
        cursor = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString(),
        ) as typeof cursor;
      } catch {
        supportInvalid(
          'SUPPORT_CURSOR_INVALID',
          'Con trỏ phân trang không hợp lệ.',
        );
      }
      if (
        typeof cursor.id !== 'string' ||
        typeof cursor.time !== 'string' ||
        !Number.isFinite(Date.parse(cursor.time))
      )
        supportInvalid(
          'SUPPORT_CURSOR_INVALID',
          'Con trỏ phân trang không hợp lệ.',
        );
      where.AND = [
        {
          OR: [
            { updatedAt: { lt: new Date(cursor.time) } },
            { updatedAt: new Date(cursor.time), id: { lt: cursor.id } },
          ],
        },
      ];
    }
    const rows = await this.repository.prisma.supportTicket.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const more = rows.length > query.limit;
    rows.splice(query.limit);
    const last = rows.at(-1);
    return {
      items: await this.repository.summaries(actor, rows),
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({
                time: last.updatedAt.toISOString(),
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    };
  }

  async detail(actor: AuthenticatedUser, id: string, branchId?: string) {
    const ticket = await this.ticket(actor, id, branchId);
    return (await this.repository.summaries(actor, [ticket]))[0];
  }

  async assignees(
    actor: AuthenticatedUser,
    query: SupportAssigneeQueryDto,
    branchId?: string,
  ) {
    if (
      !branchId ||
      !hasSupportPermission(actor, branchId, 'support.read') ||
      !hasSupportPermission(actor, branchId, 'support.manage')
    )
      supportForbidden();
    return this.repository.eligibleAssignees(branchId, query);
  }

  async history(
    actor: AuthenticatedUser,
    id: string,
    query: SupportHistoryQueryDto,
    branchId?: string,
  ) {
    await this.ticket(actor, id, branchId);
    if (query.afterSequence !== undefined && query.beforeSequence !== undefined)
      supportInvalid(
        'SUPPORT_CURSOR_INVALID',
        'Chỉ chọn một hướng phân trang.',
      );
    const forward = query.afterSequence !== undefined;
    const rows = await this.repository.prisma.supportMessage.findMany({
      where: {
        ticketId: id,
        sequence: {
          ...(forward
            ? { gt: query.afterSequence }
            : { lt: query.beforeSequence }),
        },
      },
      orderBy: { sequence: forward ? 'asc' : 'desc' },
      take: query.limit + 1,
      include: supportMessageInclude,
    });
    const more = rows.length > query.limit;
    rows.splice(query.limit);
    const nextSequence = more ? rows.at(-1)!.sequence : null;
    if (!forward) rows.reverse();
    return { items: rows.map(supportMessageDto), nextSequence };
  }

  async unread(actor: AuthenticatedUser, branchId?: string) {
    this.listScope(actor, branchId);
    // One aggregate query, including tickets outside the current inbox page.
    const rows = await this.repository.prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT count(*)::bigint AS count FROM support_messages m
      JOIN support_tickets t ON t.id = m.ticket_id
      LEFT JOIN support_read_states r ON r.ticket_id = t.id AND r.user_id = ${actor.id}
      WHERE ${actor.type === 'CUSTOMER' ? Prisma.sql`t.customer_id = ${actor.id}` : Prisma.sql`t.branch_id = ${branchId!}`}
      AND m.sender_type = ${actor.type === 'CUSTOMER' ? 'BRANCH' : 'CUSTOMER'}::"UserType"
      AND m.sequence > COALESCE(r.last_read_sequence, 0)`;
    return { unreadCount: Number(rows[0].count) };
  }

  async orderContext(actor: AuthenticatedUser, orderId: string) {
    if (actor.type !== 'CUSTOMER') supportForbidden();
    const order = await this.repository.prisma.order.findFirst({
      where: { id: orderId, userId: actor.id },
      select: { id: true, orderCode: true, branchId: true, status: true },
    });
    if (!order) supportNotFound();
    const active = await this.repository.prisma.supportTicket.findFirst({
      where: {
        customerId: actor.id,
        orderId,
        type: 'ORDER',
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      select: { id: true },
    });
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      branchId: order.branchId,
      status: order.status,
      activeTicketId: active?.id ?? null,
      canViewOrderDetail: true,
    };
  }

  async ticketOrder(actor: AuthenticatedUser, id: string, branchId?: string) {
    const ticket = await this.ticket(actor, id, branchId);
    if (!ticket.orderId) supportNotFound();
    const order = await this.repository.prisma.order.findUniqueOrThrow({
      where: { id: ticket.orderId },
      select: { id: true, orderCode: true, status: true, branchId: true },
    });
    return {
      orderId: order.id,
      orderCode: order.orderCode,
      status: order.status,
      branchId: order.branchId,
      activeTicketId: ticket.status === 'RESOLVED' ? null : ticket.id,
      canViewOrderDetail:
        actor.type === 'CUSTOMER' ||
        actor.branchAssignments.some(
          (a) =>
            a.branchId === ticket.branchId &&
            a.isActive &&
            a.permissions.includes('orders.read'),
        ),
    };
  }

  private async activity(
    tx: SupportTx,
    actor: AuthenticatedUser,
    ticket: SupportTicket,
    action: string,
    fromStatus: SupportTicket['status'] | null,
    toStatus: SupportTicket['status'],
    toAssigneeId: string | null,
  ) {
    await tx.supportTicketActivity.create({
      data: {
        ticketId: ticket.id,
        actorId: actor.id,
        action,
        fromStatus,
        toStatus,
        fromAssigneeId: ticket.assigneeId,
        toAssigneeId,
      },
    });
  }

  async transition(
    actor: AuthenticatedUser,
    id: string,
    action: 'claim' | 'unclaim' | 'reassign' | 'resolve' | 'reopen',
    branchId?: string,
    assigneeId?: string,
  ) {
    const result = await this.repository.prisma.$transaction(
      async (tx) => {
        const source = await this.ticket(actor, id, branchId, tx);
        // Same scope lock order as create prevents reopen/create deadlocks.
        await this.repository.lockScope(tx, supportScope(source));
        const ticket = await this.repository.lockTicket(tx, id);
        let status = ticket.status;
        let assigned = ticket.assigneeId;
        const manager = hasSupportPermission(
          actor,
          ticket.branchId,
          'support.manage',
        );
        const ownReply =
          ticket.assigneeId === actor.id &&
          hasSupportPermission(actor, ticket.branchId, 'support.reply');
        if (action === 'reopen') {
          if (actor.type !== 'CUSTOMER' || ticket.customerId !== actor.id)
            supportForbidden();
          if (status !== 'RESOLVED') return { id: ticket.id, changed: false };
          const branch = await tx.branch.findUnique({
            where: { id: ticket.branchId },
          });
          if (!branch?.isActive)
            supportInvalid(
              'SUPPORT_BRANCH_UNAVAILABLE',
              'Chi nhánh hiện không tiếp nhận yêu cầu mới.',
            );
          const active = await tx.supportTicket.findFirst({
            where: this.scopeWhere(ticket),
          });
          if (active) return { id: active.id, changed: false };
          status = 'OPEN';
          assigned = null;
        } else {
          if (actor.type !== 'BRANCH') supportForbidden();
          if (action === 'claim') {
            if (
              !hasSupportPermission(actor, ticket.branchId, 'support.claim') ||
              !hasSupportPermission(actor, ticket.branchId, 'support.reply')
            )
              supportForbidden();
            if (status !== 'OPEN' || assigned)
              supportConflict('SUPPORT_TICKET_ALREADY_CLAIMED', id);
            status = 'IN_PROGRESS';
            assigned = actor.id;
          } else if (action === 'reassign') {
            if (!manager) supportForbidden();
            if (status === 'RESOLVED')
              supportConflict('SUPPORT_TICKET_RESOLVED', id);
            if (
              !assigneeId ||
              !(await this.repository.staffCanReply(
                tx,
                assigneeId,
                ticket.branchId,
              ))
            )
              supportInvalid(
                'SUPPORT_ASSIGNEE_INVALID',
                'Nhân viên không có quyền hỗ trợ tại chi nhánh.',
              );
            status = 'IN_PROGRESS';
            assigned = assigneeId;
          } else if (action === 'unclaim') {
            if (!manager && !ownReply) supportForbidden();
            if (status === 'RESOLVED')
              supportConflict('SUPPORT_TICKET_RESOLVED', id);
            status = 'OPEN';
            assigned = null;
          } else {
            if (!manager && !ownReply) supportForbidden();
            status = 'RESOLVED';
          }
        }
        if (status === ticket.status && assigned === ticket.assigneeId)
          return { id, changed: false };
        await tx.supportTicket.update({
          where: { id },
          data: {
            status,
            assigneeId: assigned,
            resolvedAt: status === 'RESOLVED' ? new Date() : null,
            version: { increment: 1 },
            ...(assigned !== ticket.assigneeId
              ? { assigneeReadSequence: 0 }
              : {}),
          },
        });
        await this.activity(
          tx,
          actor,
          ticket,
          action.toUpperCase(),
          ticket.status,
          status,
          assigned,
        );
        return { id, changed: true };
      },
      { timeout: 15000 },
    );
    if (result.changed) this.realtime.ticketChanged(result.id);
    return this.detail(actor, result.id, branchId);
  }

  async read(
    actor: AuthenticatedUser,
    id: string,
    sequence: number,
    branchId?: string,
  ) {
    const result = await this.repository.prisma.$transaction(async (tx) => {
      const ticket = await this.repository.lockTicket(tx, id);
      await this.ticket(actor, id, branchId, tx);
      if (sequence > ticket.lastSequence)
        supportInvalid(
          'SUPPORT_READ_INVALID',
          'Mốc đã đọc vượt quá lịch sử hội thoại.',
        );
      const state = await tx.supportReadState.findUnique({
        where: { ticketId_userId: { ticketId: id, userId: actor.id } },
      });
      const next = Math.max(state?.lastReadSequence ?? 0, sequence);
      const assigneeChanged =
        ticket.assigneeId === actor.id &&
        sequence > ticket.assigneeReadSequence;
      const changed = next > (state?.lastReadSequence ?? 0) || assigneeChanged;
      if (next > (state?.lastReadSequence ?? 0))
        await tx.supportReadState.upsert({
          where: { ticketId_userId: { ticketId: id, userId: actor.id } },
          create: { ticketId: id, userId: actor.id, lastReadSequence: next },
          update: { lastReadSequence: next },
        });
      if (assigneeChanged)
        await tx.supportTicket.update({
          where: { id },
          data: { assigneeReadSequence: sequence, version: { increment: 1 } },
        });
      return {
        ticketId: id,
        lastReadSequence: next,
        changed,
        visible: actor.type === 'CUSTOMER' || ticket.assigneeId === actor.id,
        receiptSequence:
          actor.type === 'CUSTOMER'
            ? next
            : Math.max(
                ticket.assigneeReadSequence,
                assigneeChanged ? sequence : 0,
              ),
      };
    });
    if (result.changed) this.realtime.readUpdated(actor.id, result);
    return { ticketId: id, lastReadSequence: result.lastReadSequence };
  }

  async activities(
    actor: AuthenticatedUser,
    id: string,
    cursor?: string,
    branchId?: string,
  ) {
    await this.ticket(actor, id, branchId);
    const rows = await this.repository.prisma.supportTicketActivity.findMany({
      where: { ticketId: id, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: 'desc' },
      take: 31,
    });
    const more = rows.length > 30;
    rows.splice(30);
    return {
      items: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: more ? rows.at(-1)!.id : null,
    };
  }
}
