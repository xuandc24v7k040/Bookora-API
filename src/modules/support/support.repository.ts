import { Injectable } from '@nestjs/common';
import { Prisma, type SupportTicket } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { SupportMessageDto, SupportTicketDto } from './dto/support.dto';
import { supportNotFound } from './support.policy';

export const supportMessageInclude = {
  attachments: {
    select: { id: true, filename: true, mimeType: true, size: true },
    orderBy: { id: 'asc' as const },
  },
  sender: { select: { fullName: true, avatarUrl: true } },
  replyTo: {
    select: {
      id: true,
      text: true,
      ticketId: true,
      sender: { select: { fullName: true } },
      _count: { select: { attachments: true } },
    },
  },
} satisfies Prisma.SupportMessageInclude;

export type SupportMessageRecord = Prisma.SupportMessageGetPayload<{
  include: typeof supportMessageInclude;
}>;
export type SupportTx = Prisma.TransactionClient;

/** Same effective ALLOW/role minus DENY policy for lookup and assignment validation. */
function supportAssigneeWhere(branchId: string): Prisma.UserBranchWhereInput {
  return {
    branchId,
    isActive: true,
    user: { type: 'BRANCH', isActive: true },
    branch: { isActive: true },
    AND: ['support.read', 'support.reply'].map((code) => ({
      permissions: { none: { effect: 'DENY', permission: { code } } },
      OR: [
        { permissions: { some: { effect: 'ALLOW', permission: { code } } } },
        {
          roles: {
            some: {
              role: {
                isActive: true,
                rolePermissions: { some: { permission: { code } } },
              },
            },
          },
        },
      ],
    })),
  };
}

export function supportMessageDto(
  message: SupportMessageRecord,
): SupportMessageDto {
  return {
    id: message.id,
    ticketId: message.ticketId,
    senderUserId: message.senderUserId,
    senderType: message.senderType,
    senderName: message.sender.fullName ?? '',
    clientMessageId: message.clientMessageId,
    text: message.text,
    senderAvatarUrl: message.sender.avatarUrl,
    replyToMessageId: message.replyToMessageId,
    replyTo:
      message.replyTo?.ticketId === message.ticketId
        ? {
            id: message.replyTo.id,
            senderName: message.replyTo.sender.fullName ?? '',
            text: message.replyTo.text
              ? Array.from(message.replyTo.text).slice(0, 240).join('')
              : null,
            attachmentCount: message.replyTo._count.attachments,
          }
        : null,
    sequence: message.sequence,
    createdAt: message.createdAt.toISOString(),
    attachments: message.attachments,
  };
}

@Injectable()
export class SupportRepository {
  constructor(readonly prisma: PrismaService) {}

  async lockScope(tx: SupportTx, key: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  async lockTicket(tx: SupportTx, id: string): Promise<SupportTicket> {
    await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${id} FOR UPDATE`;
    const ticket = await tx.supportTicket.findUnique({ where: { id } });
    return ticket ?? supportNotFound();
  }

  async staffCanReply(
    tx: SupportTx,
    id: string,
    branchId: string,
  ): Promise<boolean> {
    return (
      (await tx.userBranch.count({
        where: { ...supportAssigneeWhere(branchId), userId: id },
      })) > 0
    );
  }

  async eligibleAssignees(
    branchId: string,
    query: { query?: string; cursor?: string },
  ) {
    const rows = await this.prisma.userBranch.findMany({
      where: {
        ...supportAssigneeWhere(branchId),
        ...(query.cursor ? { userId: { gt: query.cursor } } : {}),
        user: {
          type: 'BRANCH',
          isActive: true,
          ...(query.query
            ? {
                fullName: {
                  contains: query.query,
                  mode: 'insensitive' as const,
                },
              }
            : {}),
        },
      },
      orderBy: { userId: 'asc' },
      take: 31,
      select: { userId: true, user: { select: { fullName: true } } },
    });
    const more = rows.length > 30;
    rows.splice(30);
    return {
      items: rows.map((row) => ({
        id: row.userId,
        name: row.user.fullName ?? '',
      })),
      nextCursor: more ? rows.at(-1)!.userId : null,
    };
  }

  async summaries(
    actor: AuthenticatedUser,
    tickets: SupportTicket[],
  ): Promise<SupportTicketDto[]> {
    if (!tickets.length) return [];
    const records = await this.prisma.supportTicket.findMany({
      where: { id: { in: tickets.map((t) => t.id) } },
      include: {
        customer: { select: { fullName: true, avatarUrl: true } },
        branch: { select: { name: true } },
        assignee: { select: { fullName: true } },
        order: { select: { orderCode: true } },
        reads: {
          where: {
            userId: { in: [actor.id, ...tickets.map((t) => t.customerId)] },
          },
        },
        messages: {
          orderBy: { sequence: 'desc' },
          take: 1,
          include: supportMessageInclude,
        },
      },
    });
    const reads = new Map(
      records.map((t) => [
        t.id,
        t.reads.find((r) => r.userId === actor.id)?.lastReadSequence ?? 0,
      ]),
    );
    const unread = await this.prisma.supportMessage.groupBy({
      by: ['ticketId'],
      where: {
        senderType: actor.type === 'CUSTOMER' ? 'BRANCH' : 'CUSTOMER',
        OR: records.map((t) => ({
          ticketId: t.id,
          sequence: { gt: reads.get(t.id)! },
        })),
      },
      _count: { _all: true },
    });
    const counts = new Map(unread.map((u) => [u.ticketId, u._count._all]));
    const byId = new Map(records.map((t) => [t.id, t]));
    return tickets.map((original) => {
      const t = byId.get(original.id)!;
      return {
        id: t.id,
        customerId: t.customerId,
        customerName: t.customer.fullName ?? '',
        customerAvatarUrl: t.customer.avatarUrl,
        branchId: t.branchId,
        branchName: t.branch.name,
        type: t.type,
        orderId: t.orderId,
        orderCode: t.order?.orderCode ?? null,
        subject: t.subject,
        status: t.status,
        assigneeId: t.assigneeId,
        assigneeName: t.assignee?.fullName ?? null,
        version: t.version,
        lastSequence: t.lastSequence,
        lastReadSequence: reads.get(t.id)!,
        customerReadSequence:
          t.reads.find((r) => r.userId === t.customerId)?.lastReadSequence ?? 0,
        assigneeReadSequence: t.assigneeReadSequence,
        unreadCount: counts.get(t.id) ?? 0,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        resolvedAt: t.resolvedAt?.toISOString() ?? null,
        lastMessage: t.messages[0] ? supportMessageDto(t.messages[0]) : null,
      };
    });
  }
}
