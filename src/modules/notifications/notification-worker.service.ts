import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type NotificationDispatch,
  type Notification,
  type MembershipTier,
} from '@/generated/prisma/client';
import {
  MEMBERSHIP_TIERS,
  TIER_LABELS,
} from '@/modules/membership/membership-rules';
import { PrismaService } from '@/database/prisma.service';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher';
import { activeFlashUsage } from '@/modules/flash-sales/flash-sale-allocations';
import {
  canReceiveNotifications,
  hasOrderProcessingPermissions,
} from './notification-access';

interface Message {
  title: string;
  content: string;
  category: 'ORDER' | 'PROMOTION';
  referenceType: 'ORDER' | 'COUPON' | 'FLASH_SALE' | 'MEMBERSHIP';
  minimumMembershipTier?: MembershipTier | null;
  branchId: string | null;
  customerId?: string;
}
const BRANCH_KINDS = new Set([
  'ORDER_NEW_COD',
  'ORDER_NEW_PAID',
  'ORDER_RECEIVED',
  'ORDER_CUSTOMER_CANCELLED',
]);
const TITLES: Record<string, string> = {
  ORDER_NEW_COD: 'Có đơn hàng mới',
  ORDER_NEW_PAID: 'Có đơn hàng đã thanh toán',
  PAYMENT_PAID: 'Thanh toán thành công cho đơn hàng',
  ORDER_CONFIRMED: 'Đã xác nhận đơn hàng',
  ORDER_PACKING: 'Đang chuẩn bị đơn hàng',
  ORDER_SHIPPING: 'Đang giao đơn hàng',
  ORDER_COMPLETED: 'Đã hoàn tất đơn hàng',
  ORDER_ADMIN_CANCELLED: 'Đã hủy đơn hàng',
  ORDER_CUSTOMER_CANCELLED: 'Khách hàng đã hủy đơn hàng',
  ORDER_RECEIVED: 'Khách đã xác nhận nhận hàng',
  PAYMENT_TERMINAL: 'Đã hết thời hạn thanh toán đơn hàng',
};

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = true;
  private draining = false;
  private wakeHandle?: ReturnType<typeof setImmediate>;
  private promotionTimer?: ReturnType<typeof setTimeout>;
  private deadlineTask?: Promise<void>;
  private deadlineDirty = false;
  private dueWorkPending = false;
  private contentionRetryAt = 0;
  private readonly pendingOrders = new Set<string>();
  private readonly idleWaiters = new Set<() => void>();
  private readonly logger = new Logger(NotificationWorker.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: RealtimePublisher,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.stopped = false;
    if (this.timer) clearInterval(this.timer);
    const pollMs = Number(
      this.config.get<string>('NOTIFICATIONS_POLL_MS') ?? 5000,
    );
    if (!Number.isInteger(pollMs) || pollMs < 100 || pollMs > 60000)
      throw new Error('NOTIFICATIONS_POLL_MS phải từ 100 đến 60000.');
    this.timer = setInterval(() => {
      this.dueWorkPending = true;
      this.scheduleWake();
      this.wakePromotions();
    }, pollMs);
    this.timer.unref();
    this.wakePromotions();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.wakeHandle) clearImmediate(this.wakeHandle);
    if (this.promotionTimer) clearTimeout(this.promotionTimer);
    this.promotionTimer = undefined;
    this.deadlineDirty = false;
    this.dueWorkPending = false;
    this.wakeHandle = undefined;
    this.pendingOrders.clear();
    if (this.running)
      await new Promise<void>((resolve) => this.idleWaiters.add(resolve));
    await this.deadlineTask;
  }

  /** A best-effort hint, never an alternative to durable dueAt/claim/retry. */
  wakeOrder(orderId: string): void {
    if (this.stopped || this.pendingOrders.size >= 1024) return;
    this.pendingOrders.add(orderId);
    this.scheduleWake();
  }

  /** Coalesced post-commit hint. There is one deadline for all pending promotions. */
  wakePromotions(): void {
    if (this.stopped) return;
    this.deadlineDirty = true;
    if (this.deadlineTask) return;
    this.deadlineTask = this.rearmPromotionDeadline().finally(() => {
      this.deadlineTask = undefined;
      if (this.deadlineDirty && !this.stopped) this.wakePromotions();
    });
  }

  private async rearmPromotionDeadline(): Promise<void> {
    try {
      do {
        this.deadlineDirty = false;
        if (this.promotionTimer) clearTimeout(this.promotionTimer);
        this.promotionTimer = undefined;
        const started = performance.now();
        const [next] = await this.prisma.$queryRaw<Array<{ delayMs: number }>>`
          SELECT EXTRACT(EPOCH FROM (due_at - (clock_timestamp() AT TIME ZONE 'UTC'))) * 1000 AS "delayMs"
          FROM notification_dispatches
          WHERE state = 'PENDING' AND kind IN ('COUPON_ACTIVE', 'FLASH_SALE_ACTIVE')
          ORDER BY due_at, id LIMIT 1`;
        if (this.stopped) return;
        if (this.deadlineDirty) continue;
        if (!next) return;
        const delay = Math.max(
          Number(next.delayMs) - (performance.now() - started),
          this.contentionRetryAt - performance.now(),
        );
        if (delay <= 0) {
          this.dueWorkPending = true;
          this.scheduleWake();
          return;
        }
        this.promotionTimer = setTimeout(
          () => {
            this.promotionTimer = undefined;
            this.dueWorkPending = true;
            this.scheduleWake();
          },
          Math.min(2_147_483_647, Math.max(1, Math.ceil(delay) + 5)),
        );
        this.promotionTimer.unref();
      } while (this.deadlineDirty && !this.stopped);
    } catch {
      // A missed deadline lookup is repaired by the existing bounded poll.
      this.logger.warn('Không thể hẹn promotion wake; polling sẽ thử lại.');
    }
  }

  private scheduleWake(): void {
    if (
      this.stopped ||
      this.running ||
      this.draining ||
      this.wakeHandle ||
      (!this.pendingOrders.size && !this.dueWorkPending)
    )
      return;
    this.wakeHandle = setImmediate(() => {
      this.wakeHandle = undefined;
      void this.drainOrders();
    });
    this.wakeHandle.unref();
  }

  private async drainOrders(): Promise<void> {
    this.draining = true;
    try {
      // Alternate targeted Orders with FIFO due work, then yield after eight batches.
      for (let batch = 0; batch < 8 && !this.stopped; batch++) {
        const orderId = this.pendingOrders.values().next().value;
        if (orderId && (batch % 2 === 0 || !this.dueWorkPending)) {
          this.pendingOrders.delete(orderId);
          if (await this.tick(orderId)) this.pendingOrders.add(orderId);
        } else if (this.dueWorkPending) {
          this.dueWorkPending = false;
          if (await this.tick()) this.dueWorkPending = true;
          else this.contentionRetryAt = performance.now() + 250;
        } else break;
      }
    } finally {
      this.draining = false;
      this.scheduleWake();
      this.wakePromotions();
    }
  }

  /** One locked batch per tick; a crash releases the DB lock and rolls back cursor + rows. */
  async tick(orderId?: string): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    let claimedId: string | undefined;
    try {
      const rows = await this.prisma.$transaction(
        async (tx) => {
          const [claimed] = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM notification_dispatches
          WHERE state = 'PENDING' AND due_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
            AND (${orderId ?? null}::text IS NULL OR
              (reference_id = ${orderId ?? null} AND kind NOT IN ('COUPON_ACTIVE', 'FLASH_SALE_ACTIVE')))
          ORDER BY due_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`;
          if (!claimed) return [];
          claimedId = claimed.id;
          const job = await tx.notificationDispatch.findUniqueOrThrow({
            where: { id: claimed.id },
          });
          const [{ now }] = await tx.$queryRaw<
            Array<{ now: Date }>
          >`SELECT CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS now`;
          // Serialize a broadcast batch with campaign edits. NOWAIT avoids a
          // job→campaign / campaign→job deadlock with the existing save hooks.
          if (job.kind === 'COUPON_ACTIVE')
            await tx.$queryRaw`SELECT id FROM coupons WHERE id = ${job.referenceId} FOR SHARE NOWAIT`;
          if (job.kind === 'FLASH_SALE_ACTIVE')
            await tx.$queryRaw`SELECT id FROM flash_sales WHERE id = ${job.referenceId} FOR SHARE NOWAIT`;
          const campaign =
            job.kind === 'COUPON_ACTIVE'
              ? await tx.coupon.findUnique({
                  where: { id: job.referenceId },
                  select: { startAt: true },
                })
              : job.kind === 'FLASH_SALE_ACTIVE'
                ? await tx.flashSale.findUnique({
                    where: { id: job.referenceId },
                    select: { startAt: true },
                  })
                : null;
          if (campaign && campaign.startAt > now) {
            await tx.notificationDispatch.update({
              where: { id: job.id },
              data: { dueAt: campaign.startAt },
            });
            return [];
          }
          const message = await this.message(tx, job, now);
          if (!message) {
            await tx.notificationDispatch.update({
              where: { id: job.id },
              data: { state: 'SKIPPED', skipReason: 'REFERENCE_NOT_ELIGIBLE' },
            });
            return [];
          }
          const cutoff = job.audienceCutoff ?? now;
          const users = await tx.user.findMany({
            where: {
              isActive: true,
              type: message.branchId ? 'BRANCH' : 'CUSTOMER',
              createdAt: { lte: cutoff },
              id: job.cursor ? { gt: job.cursor } : undefined,
              ...(message.customerId ? { id: message.customerId } : {}),
              ...(message.minimumMembershipTier &&
              message.minimumMembershipTier !== 'BRONZE'
                ? {
                    membershipTierHistories: {
                      some: {
                        toTier: {
                          in: MEMBERSHIP_TIERS.slice(
                            MEMBERSHIP_TIERS.indexOf(
                              message.minimumMembershipTier,
                            ),
                          ),
                        },
                        createdAt: { lte: cutoff },
                      },
                    },
                  }
                : {}),
              ...(message.branchId
                ? {
                    userBranches: {
                      some: {
                        branchId: message.branchId,
                        isActive: true,
                        assignedAt: { lte: cutoff },
                        branch: { isActive: true },
                      },
                    },
                  }
                : {}),
            },
            include: {
              userBranches: {
                where: {
                  branchId: message.branchId ?? undefined,
                  isActive: true,
                  branch: { isActive: true },
                  assignedAt: { lte: cutoff },
                },
                include: {
                  roles: {
                    where: { role: { isActive: true } },
                    include: {
                      role: {
                        include: {
                          rolePermissions: { include: { permission: true } },
                        },
                      },
                    },
                  },
                  permissions: { include: { permission: true } },
                },
              },
            },
            orderBy: { id: 'asc' },
            take: 100,
          });
          const recipients = users.filter((user) => {
            if (user.id === job.actorUserId && job.kind !== 'PAYMENT_PAID')
              return false;
            if (!message.branchId) return true;
            return user.userBranches.some((assignment) => {
              const grants = new Set(
                assignment.roles.flatMap(({ role }) =>
                  role.rolePermissions.map(({ permission }) => permission.code),
                ),
              );
              for (const override of assignment.permissions)
                if (override.effect === 'ALLOW')
                  grants.add(override.permission.code);
              for (const override of assignment.permissions)
                if (override.effect === 'DENY')
                  grants.delete(override.permission.code);
              return hasOrderProcessingPermissions([...grants]);
            });
          });
          await tx.notification.createMany({
            data: recipients.map(({ id }) => ({
              userId: id,
              dispatchId: job.id,
              type: job.kind,
              category: message.category,
              title: message.title.slice(0, 200),
              content: message.content.slice(0, 1000),
              branchId: message.branchId,
              referenceType: message.referenceType,
              referenceId: job.referenceId,
            })),
            skipDuplicates: true,
          });
          await tx.notificationDispatch.update({
            where: { id: job.id },
            data: {
              audienceCutoff: cutoff,
              cursor: users.at(-1)?.id ?? job.cursor,
              state:
                users.length < 100 || Boolean(message.customerId)
                  ? 'DONE'
                  : 'PENDING',
              // Rotate large broadcasts behind other due jobs without delaying their start.
              dueAt: now,
              attempts: 0,
            },
          });
          return tx.notification.findMany({
            where: {
              dispatchId: job.id,
              userId: { in: recipients.map(({ id }) => id) },
            },
          });
        },
        { timeout: 15000 },
      );
      for (let offset = 0; offset < rows.length; offset += 10)
        await Promise.all(
          rows.slice(offset, offset + 10).map((row) =>
            this.publish(row).catch(() => {
              this.logger.warn(
                'Lịch sử đã lưu; realtime sẽ đồng bộ lại qua REST.',
              );
            }),
          ),
        );
      return Boolean(claimedId);
    } catch {
      this.logger.warn('Không thể xử lý lô thông báo; sẽ thử lại với backoff.');
      if (claimedId) {
        // Row remains PENDING after rollback. Retry without a permanently stuck lease.
        await this.prisma.$executeRaw`
          UPDATE notification_dispatches SET attempts = attempts + 1,
            due_at = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + LEAST(300, power(2, LEAST(attempts + 1, 8))) * interval '1 second'
          WHERE id = ${claimedId} AND state = 'PENDING'`.catch(() => undefined);
      }
      return false;
    } finally {
      this.running = false;
      for (const resolve of this.idleWaiters) resolve();
      this.idleWaiters.clear();
      this.scheduleWake();
      if (!orderId && !this.draining) this.wakePromotions();
    }
  }

  private publish(row: Notification): Promise<void> {
    return this.publisher.publishToUser(
      row.userId,
      {
        name: 'notification.changed',
        version: 1,
        data: { id: row.id, branchId: row.branchId, type: row.type },
      },
      (principal) => canReceiveNotifications(principal, row.branchId),
    );
  }

  private async message(
    tx: Prisma.TransactionClient,
    job: NotificationDispatch,
    now: Date,
  ): Promise<Message | null> {
    if (job.kind === 'MEMBERSHIP_UPGRADED') {
      const history = await tx.membershipTierHistory.findFirst({
        where: { orderId: job.referenceId, source: 'ORDER' },
      });
      if (!history || history.source !== 'ORDER') return null;
      return {
        title: `Bạn đã đạt hạng ${TIER_LABELS[history.toTier]}`,
        content:
          'Chi tiêu hợp lệ đã được tích lũy. Xem hạng thành viên và các coupon theo chiến dịch tại Bookora.',
        category: 'PROMOTION',
        referenceType: 'MEMBERSHIP',
        branchId: null,
        customerId: history.userId,
      };
    }
    if (job.kind === 'COUPON_ACTIVE') {
      const coupon = await tx.coupon.findUnique({
        where: { id: job.referenceId },
      });
      if (
        !coupon ||
        !coupon.isActive ||
        coupon.visibility !== 'PUBLIC' ||
        coupon.endAt <= now
      )
        return null;
      if (coupon.startAt > now) {
        await tx.notificationDispatch.update({
          where: { id: job.id },
          data: { dueAt: coupon.startAt },
        });
        return null;
      }
      const usage = await tx.couponRedemption.count({
        where: {
          couponId: coupon.id,
          OR: [
            { status: 'CONSUMED' },
            { status: 'RESERVED', expiresAt: { gt: now } },
          ],
        },
      });
      if (coupon.usageLimit !== null && usage >= coupon.usageLimit) return null;
      const money = (v: unknown) => Number(v).toLocaleString('vi-VN') + ' đ';
      return {
        title: `Mã ${coupon.code} đã có hiệu lực`,
        category: 'PROMOTION',
        branchId: null,
        referenceType: 'COUPON',
        minimumMembershipTier: coupon.minimumMembershipTier,
        content: `${coupon.type === 'SHIPPING' ? 'Giảm phí vận chuyển' : 'Giảm giá đơn hàng'} ${coupon.discountType === 'PERCENTAGE' ? `${Number(coupon.discountValue)}%` : money(coupon.discountValue)}${coupon.minOrderAmount ? `, đơn từ ${money(coupon.minOrderAmount)}` : ''}${coupon.maxDiscount ? `, tối đa ${money(coupon.maxDiscount)}` : ''}. Đến ${coupon.endAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}. Điều kiện áp dụng khi thanh toán.`,
      };
    }
    if (job.kind === 'FLASH_SALE_ACTIVE') {
      const sale = await tx.flashSale.findUnique({
        where: { id: job.referenceId },
        include: {
          items: {
            where: {
              variant: { isActive: true, product: { status: 'ACTIVE' } },
            },
          },
        },
      });
      if (
        !sale ||
        sale.state !== 'PUBLISHED' ||
        sale.startAt > now ||
        sale.endAt <= now
      )
        return null;
      let eligible = false;
      for (const item of sale.items) {
        const used = await tx.flashSaleAllocation.aggregate({
          where: {
            flashSaleItemId: item.id,
            ...activeFlashUsage(now),
          },
          _sum: { quantity: true },
        });
        if ((used._sum.quantity ?? 0) < item.totalQuota) {
          eligible = true;
          break;
        }
      }
      if (!eligible) return null;
      return {
        title: `${sale.name} đã bắt đầu`,
        content:
          'Khám phá các đầu sách ưu đãi trong thời gian chương trình. Giá và số lượng áp dụng theo điều kiện thực tế.',
        category: 'PROMOTION',
        referenceType: 'FLASH_SALE',
        branchId: null,
      };
    }
    const order = await tx.order.findUnique({
      where: { id: job.referenceId },
      include: { payment: true },
    });
    if (!order || !TITLES[job.kind]) return null;
    // PAYMENT_PAID intents only arise from the verified transition; also fail closed on corrupted authority.
    if (
      (job.kind === 'PAYMENT_PAID' || job.kind === 'ORDER_NEW_PAID') &&
      (order.payment?.method !== 'VNPAY' || order.payment.status !== 'PAID')
    )
      return null;
    return {
      title: `${TITLES[job.kind]} #${order.orderCode}`,
      content: BRANCH_KINDS.has(job.kind)
        ? 'Đơn hàng tại chi nhánh của bạn cần được theo dõi và xử lý.'
        : 'Theo dõi chi tiết và tiến trình đơn hàng của bạn tại Bookora.',
      category: 'ORDER',
      referenceType: 'ORDER',
      branchId: BRANCH_KINDS.has(job.kind) ? order.branchId : null,
      customerId: BRANCH_KINDS.has(job.kind) ? undefined : order.userId,
    };
  }
}
