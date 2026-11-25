import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  RealtimePublisher,
  type RealtimeEvent,
} from '@/modules/realtime/realtime-publisher';
import { RealtimeInboundRegistry } from '@/modules/realtime/realtime-inbound.registry';
import type { SupportTicket } from '@/generated/prisma/client';
import type { SupportSendResultDto } from './dto/support.dto';
import { SupportRepository } from './support.repository';
import {
  assertSupportReply,
  canReadSupport,
  hasSupportPermission,
  supportForbidden,
  supportInvalid,
} from './support.policy';

interface TypingState {
  ticketId: string;
  actorId: string;
  timer: ReturnType<typeof setTimeout>;
}
export interface SupportTiming {
  messageId: string;
  validationToCommitMs: number;
  commitToPublishMs: number;
  commitToEmitCompleteMs: number;
}

@Injectable()
export class SupportRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupportRealtimeService.name);
  private readonly typing = new Map<string, TypingState>();
  private readonly unsubscribe: Array<() => void> = [];
  private readonly pending = new Set<Promise<void>>();
  private readonly timings: SupportTiming[] = [];

  constructor(
    private readonly repository: SupportRepository,
    private readonly publisher: RealtimePublisher,
    private readonly inbound: RealtimeInboundRegistry,
  ) {}

  onModuleInit(): void {
    for (const name of ['chat.typing.start', 'chat.typing.stop'] as const)
      this.unsubscribe.push(
        this.inbound.register(name, (actor, payload, connectionId) =>
          this.signal(actor, payload, connectionId, name.endsWith('start')),
        ),
      );
    this.unsubscribe.push(
      this.inbound.onDisconnect((id) => {
        this.stopConnection(id);
      }),
    );
  }

  private launch(work: () => Promise<void>): void {
    const task = work().catch(() => {
      this.logger.warn(
        'Support realtime chưa phát được; dữ liệu đã lưu và có thể đối soát qua REST.',
      );
    });
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  async settled(): Promise<void> {
    await Promise.all([...this.pending]);
  }
  timingSnapshot(): SupportTiming[] {
    return this.timings.map((t) => ({ ...t }));
  }

  private async recipients(ticket: SupportTicket): Promise<string[]> {
    const recipients = new Set([ticket.customerId]);
    let cursor: string | undefined;
    do {
      const rows = await this.repository.prisma.userBranch.findMany({
        where: {
          branchId: ticket.branchId,
          isActive: true,
          branch: { isActive: true },
          user: { isActive: true, type: 'BRANCH' },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, userId: true },
        take: 100,
        orderBy: { id: 'asc' },
      });
      for (const row of rows) recipients.add(row.userId);
      if (rows.length < 100) break;
      cursor = rows.at(-1)!.id;
    } while (cursor);
    return [...recipients];
  }

  private async fanout(
    ticket: SupportTicket,
    event: RealtimeEvent,
    only?: string[],
    entitled = (p: AuthenticatedUser) => canReadSupport(p, ticket),
  ) {
    const ids = only ?? (await this.recipients(ticket));
    for (let offset = 0; offset < ids.length; offset += 10)
      await Promise.all(
        ids
          .slice(offset, offset + 10)
          .map((id) => this.publisher.publishToUser(id, event, entitled)),
      );
  }

  message(
    result: SupportSendResultDto,
    validated: number,
    committed: number,
  ): void {
    this.launch(async () => {
      const ticket =
        await this.repository.prisma.supportTicket.findUniqueOrThrow({
          where: { id: result.ticketId },
        });
      const ids = await this.recipients(ticket);
      const data = {
        ...result.message,
        messageId: result.message.id,
        branchId: ticket.branchId,
        ticketVersion: ticket.version,
        contentOmitted: false,
      };
      let event: RealtimeEvent = {
        name: 'chat.message.created',
        version: 1,
        data,
      };
      if (Buffer.byteLength(JSON.stringify(event)) > 8192)
        event = {
          ...event,
          data: {
            ticketId: ticket.id,
            messageId: result.message.id,
            clientMessageId: result.message.clientMessageId,
            sequence: result.message.sequence,
            branchId: ticket.branchId,
            ticketVersion: ticket.version,
            contentOmitted: true,
          },
        };
      const triggered = performance.now();
      await this.fanout(ticket, event, ids);
      this.timings.push({
        messageId: result.message.id,
        validationToCommitMs: committed - validated,
        commitToPublishMs: triggered - committed,
        commitToEmitCompleteMs: performance.now() - committed,
      });
      if (this.timings.length > 256) this.timings.shift();
      await this.changed(ticket, ids);
    });
  }

  private async changed(ticket: SupportTicket, ids?: string[]) {
    await this.fanout(
      ticket,
      {
        name: 'chat.ticket.changed',
        version: 1,
        data: {
          ticketId: ticket.id,
          branchId: ticket.branchId,
          status: ticket.status,
          assigneeId: ticket.assigneeId,
          updatedAt: ticket.updatedAt.toISOString(),
          ticketVersion: ticket.version,
          lastSequence: ticket.lastSequence,
        },
      },
      ids,
    );
  }

  ticketChanged(id: string): void {
    this.launch(async () => {
      await this.changed(
        await this.repository.prisma.supportTicket.findUniqueOrThrow({
          where: { id },
        }),
      );
    });
  }

  readUpdated(
    userId: string,
    result: {
      ticketId: string;
      lastReadSequence: number;
      visible: boolean;
      receiptSequence: number;
    },
  ): void {
    this.launch(async () => {
      const ticket =
        await this.repository.prisma.supportTicket.findUniqueOrThrow({
          where: { id: result.ticketId },
        });
      await this.fanout(
        ticket,
        {
          name: 'chat.read.updated',
          version: 1,
          data: {
            ticketId: ticket.id,
            userId,
            lastReadSequence: result.lastReadSequence,
            receipt: false,
          },
        },
        [userId],
      );
      // Other readers do not create customer receipts. Reassignment invalidates prior staff receipts.
      if (
        result.visible &&
        (userId === ticket.customerId || userId === ticket.assigneeId)
      )
        await this.fanout(
          ticket,
          {
            name: 'chat.read.updated',
            version: 1,
            data: {
              ticketId: ticket.id,
              userId,
              lastReadSequence: result.receiptSequence,
              receipt: true,
              ticketVersion: ticket.version,
            },
          },
          [
            ticket.customerId,
            ...(ticket.assigneeId ? [ticket.assigneeId] : []),
          ],
        );
    });
  }

  private async signal(
    actor: AuthenticatedUser,
    payload: unknown,
    connectionId: string,
    start: boolean,
  ): Promise<void> {
    if (
      !payload ||
      typeof payload !== 'object' ||
      Object.keys(payload).length !== 1 ||
      !('ticketId' in payload) ||
      typeof payload.ticketId !== 'string' ||
      !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(payload.ticketId)
    )
      supportInvalid('SUPPORT_TYPING_INVALID', 'Hội thoại không hợp lệ.');
    const ticket = await this.repository.prisma.supportTicket.findUnique({
      where: { id: payload.ticketId },
    });
    if (
      !ticket ||
      !canReadSupport(actor, ticket) ||
      ticket.status !== 'IN_PROGRESS' ||
      !ticket.assigneeId
    )
      supportForbidden();
    assertSupportReply(actor, ticket);
    if (
      actor.type !== 'CUSTOMER' &&
      !hasSupportPermission(actor, ticket.branchId, 'support.reply')
    )
      supportForbidden();
    const previous = this.typing.get(connectionId);
    if (previous) {
      clearTimeout(previous.timer);
      this.typing.delete(connectionId);
      if (previous.ticketId !== ticket.id)
        this.launch(() =>
          this.typingEvent(previous.ticketId, previous.actorId, false),
        );
    }
    if (start) {
      if (this.typing.size >= 1000) supportForbidden();
      const timer = setTimeout(() => this.stopConnection(connectionId), 3000);
      timer.unref();
      this.typing.set(connectionId, {
        ticketId: ticket.id,
        actorId: actor.id,
        timer,
      });
    }
    await this.typingEvent(ticket.id, actor.id, start);
  }

  private stopConnection(id: string): void {
    const state = this.typing.get(id);
    if (!state) return;
    clearTimeout(state.timer);
    this.typing.delete(id);
    if (
      ![...this.typing.values()].some(
        (s) => s.ticketId === state.ticketId && s.actorId === state.actorId,
      )
    )
      this.launch(() => this.typingEvent(state.ticketId, state.actorId, false));
  }

  private async typingEvent(ticketId: string, actorId: string, start: boolean) {
    const ticket = await this.repository.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (
      !ticket ||
      ticket.status !== 'IN_PROGRESS' ||
      !ticket.assigneeId ||
      (actorId !== ticket.customerId && actorId !== ticket.assigneeId)
    )
      return;
    const target =
      actorId === ticket.customerId ? ticket.assigneeId : ticket.customerId;
    await this.fanout(
      ticket,
      {
        name: start ? 'chat.typing.start' : 'chat.typing.stop',
        version: 1,
        data: {
          ticketId,
          actorId,
          expiresAt: new Date(Date.now() + (start ? 3000 : 0)).toISOString(),
        },
      },
      [target],
      (p) =>
        canReadSupport(p, ticket) &&
        (p.type === 'CUSTOMER' ||
          (p.id === ticket.assigneeId &&
            hasSupportPermission(p, ticket.branchId, 'support.reply'))),
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.unsubscribe.forEach((off) => off());
    for (const state of this.typing.values()) clearTimeout(state.timer);
    this.typing.clear();
    await this.settled();
  }
}
