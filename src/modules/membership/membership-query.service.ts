import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import {
  Prisma,
  type CustomerMembership,
  type MembershipConfig,
} from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  MemberSort,
  MemberSortOrder,
  type MembersQueryDto,
  type MembershipPageQueryDto,
  type MembershipSummaryDto,
} from './membership.dto';
import {
  allowedTiers,
  MEMBERSHIP_TIERS,
  TIER_LABELS,
} from './membership-rules';

export function membershipConfigResponse(config: MembershipConfig) {
  return {
    silver: Number(config.silver),
    gold: Number(config.gold),
    diamond: Number(config.diamond),
    version: config.version,
    pending: config.pending,
  };
}
export function membershipSummary(
  config: MembershipConfig,
  membership: Pick<
    CustomerMembership,
    'currentTier' | 'lifetimeSpend' | 'achievedAt'
  > | null,
): MembershipSummaryDto {
  const currentTier = membership?.currentTier ?? 'BRONZE';
  const lifetimeSpend = Number(membership?.lifetimeSpend ?? 0);
  const thresholds = [
    0,
    Number(config.silver),
    Number(config.gold),
    Number(config.diamond),
  ];
  const tiers = MEMBERSHIP_TIERS.map((tier, i) => ({
    tier,
    label: TIER_LABELS[tier],
    threshold: thresholds[i],
  }));
  const nextTier = tiers[MEMBERSHIP_TIERS.indexOf(currentTier) + 1] ?? null;
  return {
    currentTier,
    lifetimeSpend,
    achievedAt: membership?.achievedAt?.toISOString() ?? null,
    tiers,
    nextTier,
    remainingSpend: nextTier
      ? Math.max(0, nextTier.threshold - lifetimeSpend)
      : 0,
    progress: nextTier ? Math.min(1, lifetimeSpend / nextTier.threshold) : 1,
  };
}
export function membershipPage<T>(
  items: T[],
  totalItems: number,
  query: MembershipPageQueryDto,
) {
  const page = query.page ?? 1,
    limit = query.limit ?? 10;
  return {
    items,
    totalItems,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(totalItems / limit)),
  };
}

@Injectable()
export class MembershipQueryService {
  constructor(private readonly prisma: PrismaService) {}
  customer(actor: AuthenticatedUser): string {
    if (actor.type !== 'CUSTOMER')
      throw new ForbiddenException(
        'Chỉ khách hàng được sử dụng hạng thành viên.',
      );
    return actor.id;
  }
  async config() {
    return membershipConfigResponse(
      await this.prisma.membershipConfig.findUniqueOrThrow({
        where: { id: 'GLOBAL' },
      }),
    );
  }
  async summary(userId: string) {
    const [config, user] = await this.prisma.$transaction([
      this.prisma.membershipConfig.findUniqueOrThrow({
        where: { id: 'GLOBAL' },
      }),
      this.prisma.user.findFirst({
        where: { id: userId, type: 'CUSTOMER' },
        select: { id: true, fullName: true, email: true, membership: true },
      }),
    ]);
    if (!user) throw new NotFoundException('Không tìm thấy thành viên.');
    return {
      userId,
      fullName: user.fullName,
      email: user.email,
      ...membershipSummary(config, user.membership),
    };
  }
  async members(query: MembersQueryDto) {
    const search = query.search?.trim() ?? '';
    const where = Prisma.sql`u.type = 'CUSTOMER'
      ${search ? Prisma.sql`AND (strpos(lower(COALESCE(u.full_name,'')),lower(${search})) > 0 OR strpos(lower(u.email),lower(${search})) > 0)` : Prisma.empty}
      ${query.tier ? Prisma.sql`AND COALESCE(m.current_tier,'BRONZE'::"MembershipTier") = ${query.tier}::"MembershipTier"` : Prisma.empty}`;
    const sort =
      query.sortBy === MemberSort.fullName
        ? Prisma.sql`u.full_name`
        : query.sortBy === MemberSort.achievedAt
          ? Prisma.sql`m.achieved_at`
          : Prisma.sql`COALESCE(m.lifetime_spend,0)`;
    const direction =
      query.sortOrder === MemberSortOrder.asc
        ? Prisma.sql`ASC`
        : Prisma.sql`DESC`;
    type MemberRow = {
      userId: string;
      fullName: string | null;
      email: string;
      currentTier: CustomerMembership['currentTier'];
      lifetimeSpend: Prisma.Decimal;
      achievedAt: Date | null;
    };
    const [config, users, totals] = await this.prisma.$transaction([
      this.prisma.membershipConfig.findUniqueOrThrow({
        where: { id: 'GLOBAL' },
      }),
      this.prisma.$queryRaw<
        MemberRow[]
      >(Prisma.sql`SELECT u.id AS "userId",u.full_name AS "fullName",u.email,
        COALESCE(m.current_tier,'BRONZE'::"MembershipTier") AS "currentTier",COALESCE(m.lifetime_spend,0) AS "lifetimeSpend",m.achieved_at AS "achievedAt"
        FROM users u LEFT JOIN customer_memberships m ON m.user_id=u.id WHERE ${where}
        ORDER BY ${sort} ${direction} NULLS LAST,u.id ASC LIMIT ${query.limit ?? 10} OFFSET ${((query.page ?? 1) - 1) * (query.limit ?? 10)}`),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(
        Prisma.sql`SELECT count(*) AS total FROM users u LEFT JOIN customer_memberships m ON m.user_id=u.id WHERE ${where}`,
      ),
    ]);
    return membershipPage(
      users.map((user) => ({
        userId: user.userId,
        fullName: user.fullName,
        email: user.email,
        ...membershipSummary(config, user),
      })),
      Number(totals[0]?.total ?? 0),
      query,
    );
  }
  async transactions(userId: string, query: MembershipPageQueryDto) {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.membershipTransaction.findMany({
        where,
        include: { order: { select: { orderCode: true } } },
        orderBy: [
          { effectiveAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 10),
        take: query.limit ?? 10,
      }),
      this.prisma.membershipTransaction.count({ where }),
    ]);
    return membershipPage(
      rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderCode: row.order.orderCode,
        amount: Number(row.amount),
        effectiveAt: row.effectiveAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        source: row.source,
      })),
      total,
      query,
    );
  }
  async histories(userId: string, query: MembershipPageQueryDto) {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.membershipTierHistory.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 10),
        take: query.limit ?? 10,
      }),
      this.prisma.membershipTierHistory.count({ where }),
    ]);
    return membershipPage(
      rows.map((row) => ({
        id: row.id,
        fromTier: row.fromTier,
        toTier: row.toTier,
        source: row.source,
        effectiveAt: row.effectiveAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }
  async coupons(userId: string, query: MembershipPageQueryDto) {
    const member = await this.prisma.customerMembership.findUnique({
      where: { userId },
    });
    const tiers = allowedTiers(member?.currentTier ?? 'BRONZE');
    const now = new Date();
    const where = Prisma.sql`c.visibility = 'PUBLIC' AND c.is_active = true AND c.start_at <= ${now} AND c.end_at > ${now}
      AND c.minimum_membership_tier::text IN (${Prisma.join(tiers)})
      AND (c.usage_limit IS NULL OR c.usage_limit > (SELECT count(*) FROM coupon_redemptions r WHERE r.coupon_id=c.id AND (r.status='CONSUMED' OR (r.status='RESERVED' AND r.expires_at > ${now}))))
      AND (c.usage_limit_per_user IS NULL OR c.usage_limit_per_user > (SELECT count(*) FROM coupon_redemptions r WHERE r.coupon_id=c.id AND r.user_id=${userId} AND (r.status='CONSUMED' OR (r.status='RESERVED' AND r.expires_at > ${now}))))`;
    const [ids, totals] = await this.prisma.$transaction([
      this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT c.id FROM coupons c WHERE ${where} ORDER BY c.end_at, c.id LIMIT ${query.limit ?? 10} OFFSET ${((query.page ?? 1) - 1) * (query.limit ?? 10)}`,
      ),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(
        Prisma.sql`SELECT count(*) AS total FROM coupons c WHERE ${where}`,
      ),
    ]);
    const rows = await this.prisma.coupon.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      orderBy: [{ endAt: 'asc' }, { id: 'asc' }],
    });
    return membershipPage(
      rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        type: row.type,
        discountType: row.discountType,
        discountValue: Number(row.discountValue),
        minOrderAmount: Number(row.minOrderAmount ?? 0),
        maxDiscount: row.maxDiscount === null ? null : Number(row.maxDiscount),
        minimumMembershipTier: row.minimumMembershipTier!,
        endAt: row.endAt.toISOString(),
      })),
      Number(totals[0]?.total ?? 0),
      query,
    );
  }
}
