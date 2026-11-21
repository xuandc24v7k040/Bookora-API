import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { PrismaService } from '@/database/prisma.service';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { NotificationWorker } from '@/modules/notifications/notification-worker.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher';
import { ORDER_CHANGE_CHANNEL, ORDER_ID_PATTERN } from './order-change-signal';

export function canViewOrder(
  principal: AuthenticatedUser,
  ownerId: string,
  branchId: string,
): boolean {
  if (principal.type === 'CUSTOMER') return principal.id === ownerId;
  return (
    principal.type === 'BRANCH' &&
    principal.branchAssignments.some(
      (assignment) =>
        assignment.branchId === branchId &&
        assignment.isActive &&
        assignment.permissions.includes('orders.read'),
    )
  );
}

/** Domain adapter: the reusable socket core has no dependency on Orders. */
@Injectable()
export class OrderRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderRealtimeService.name);
  private client?: Client;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectDelay = 1000;
  private stopped = false;
  private draining = false;
  private readonly pending = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly publisher: RealtimePublisher,
    private readonly worker: NotificationWorker,
  ) {}

  async onModuleInit(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pending.clear();
    const client = this.client;
    this.client = undefined;
    await client?.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const client = new Client({
      connectionString: this.config.getOrThrow<string>('database.url'),
      connectionTimeoutMillis: 5000,
      application_name: 'bookora-order-listener',
      keepAlive: true,
    });
    this.client = client;
    const disconnected = () => {
      if (this.client !== client) return;
      this.client = undefined;
      void client.end().catch(() => undefined);
      this.scheduleReconnect();
    };
    client.on('error', disconnected);
    client.on('end', disconnected);
    client.on('notification', (message) => {
      if (
        this.stopped ||
        message.channel !== ORDER_CHANGE_CHANNEL ||
        !ORDER_ID_PATTERN.test(message.payload ?? '')
      )
        return;
      const orderId = message.payload!;
      this.worker.wakeOrder(orderId);
      if (this.pending.size < 1024) this.pending.add(orderId);
      void this.drain();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${ORDER_CHANGE_CHANNEL}`);
      if (this.stopped) {
        await client.end();
        return;
      }
      this.reconnectDelay = 1000;
    } catch {
      disconnected();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.logger.warn(
      'Order realtime tạm gián đoạn; polling/REST vẫn phục hồi dữ liệu.',
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, this.reconnectDelay);
    this.reconnectTimer.unref();
    this.reconnectDelay = Math.min(30000, this.reconnectDelay * 2);
  }

  private async drain(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      while (this.pending.size && !this.stopped) {
        const orderId = this.pending.values().next().value!;
        this.pending.delete(orderId);
        await this.publish(orderId).catch(() => {
          this.logger.warn(
            'Không thể phát Order hint; client sẽ đối soát qua REST.',
          );
        });
      }
    } finally {
      this.draining = false;
    }
  }

  private async publish(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, branchId: true, status: true },
    });
    if (!order || this.stopped) return;
    const emit = (userId: string) =>
      this.publisher.publishToUser(
        userId,
        {
          name: 'order.changed',
          version: 1,
          data: { orderId, branchId: order.branchId },
        },
        (principal) => canViewOrder(principal, order.userId, order.branchId),
      );
    await emit(order.userId).catch(() => undefined);
    // Unpaid VNPay creation is owner-only; it is not a new branch processing alert.
    if (order.status === 'PENDING_PAYMENT' || order.status === 'PAYMENT_FAILED')
      return;
    let cursor: string | undefined;
    do {
      const users = await this.prisma.user.findMany({
        where: {
          type: 'BRANCH',
          isActive: true,
          id: cursor ? { gt: cursor } : undefined,
          userBranches: {
            some: {
              branchId: order.branchId,
              isActive: true,
              branch: { isActive: true },
            },
          },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (let offset = 0; offset < users.length && !this.stopped; offset += 10)
        await Promise.all(
          users
            .slice(offset, offset + 10)
            .map(({ id }) => emit(id).catch(() => undefined)),
        );
      if (users.length < 100) break;
      cursor = users.at(-1)!.id;
    } while (!this.stopped);
  }
}
