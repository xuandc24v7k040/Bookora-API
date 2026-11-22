import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import {
  eligibleTier,
  higherTier,
  MAX_MEMBERSHIP_MONEY,
} from './membership-rules';
import { membershipConfigResponse } from './membership-query.service';
import type { UpdateMembershipThresholdsDto } from './membership.dto';

@Injectable()
export class MembershipThresholdsService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly logger = new Logger(MembershipThresholdsService.name);
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.resume();
    }, 5000);
    this.timer.unref();
    void this.resume();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  async save(actorUserId: string, dto: UpdateMembershipThresholdsDto) {
    const result = await runSerializableTransaction(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM membership_config WHERE id = 'GLOBAL' FOR UPDATE`;
      const old = await tx.membershipConfig.findUniqueOrThrow({
        where: { id: 'GLOBAL' },
      });
      if (old.version !== dto.version || old.pending)
        throw new ConflictException({
          code: 'MEMBERSHIP_CONFIG_CONFLICT',
          message:
            'Cấu hình đã thay đổi hoặc đang xét lại thành viên. Vui lòng tải lại.',
        });
      if (
        ![dto.silver, dto.gold, dto.diamond].every(
          (n) => Number.isSafeInteger(n) && n > 0 && n <= MAX_MEMBERSHIP_MONEY,
        ) ||
        !(dto.silver < dto.gold && dto.gold < dto.diamond)
      )
        throw new BadRequestException({
          code: 'MEMBERSHIP_THRESHOLDS_INVALID',
          message: 'Ngưỡng phải tăng dần: 0 < Bạc < Vàng < Kim cương.',
        });
      const changed =
        !old.silver.eq(dto.silver) ||
        !old.gold.eq(dto.gold) ||
        !old.diamond.eq(dto.diamond);
      if (!changed) return membershipConfigResponse(old);
      const next = await tx.membershipConfig.update({
        where: { id: 'GLOBAL' },
        data: {
          silver: dto.silver,
          gold: dto.gold,
          diamond: dto.diamond,
          version: { increment: 1 },
          pending: true,
          cursor: null,
        },
      });
      await tx.membershipConfigAudit.create({
        data: {
          actorUserId,
          version: next.version,
          previous: {
            silver: old.silver.toString(),
            gold: old.gold.toString(),
            diamond: old.diamond.toString(),
          },
          next: {
            silver: String(dto.silver),
            gold: String(dto.gold),
            diamond: String(dto.diamond),
          },
        },
      });
      return membershipConfigResponse(next);
    });
    void this.resume();
    return result;
  }
  /** One durable cursor batch; save/credits and other instances serialize on the config lock. */
  async batch(): Promise<boolean> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM membership_config WHERE id = 'GLOBAL' FOR UPDATE`;
      const config = await tx.membershipConfig.findUniqueOrThrow({
        where: { id: 'GLOBAL' },
      });
      if (!config.pending) return false;
      const rows = await tx.customerMembership.findMany({
        where: { userId: config.cursor ? { gt: config.cursor } : undefined },
        orderBy: { userId: 'asc' },
        take: 100,
      });
      for (const member of rows) {
        const tier = higherTier(
          member.currentTier,
          eligibleTier(member.lifetimeSpend, config),
        );
        if (tier === member.currentTier) continue;
        const now = new Date();
        await tx.customerMembership.update({
          where: { userId: member.userId },
          data: { currentTier: tier, achievedAt: now },
        });
        await tx.membershipTierHistory.create({
          data: {
            userId: member.userId,
            fromTier: member.currentTier,
            toTier: tier,
            source: 'THRESHOLD_CHANGE',
            configVersion: config.version,
            effectiveAt: now,
          },
        });
      }
      await tx.membershipConfig.update({
        where: { id: 'GLOBAL' },
        data: {
          cursor: rows.at(-1)?.userId ?? config.cursor,
          pending: rows.length === 100,
        },
      });
      return rows.length === 100;
    });
  }
  async resume(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        for (let n = 0; n < 10 && (await this.batch()); n++) {
          /* bounded work per wake */
        }
      } catch {
        this.logger.warn(
          'Xét lại hạng thành viên chưa hoàn tất; sẽ tiếp tục từ cursor đã lưu.',
        );
      }
    })();
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
  }
}
