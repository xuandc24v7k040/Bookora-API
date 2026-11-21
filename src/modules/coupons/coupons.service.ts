import { schedulePromotion } from '@/modules/notifications/notification-intents';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Coupon } from '@/generated/prisma/client';
import { couponDiscount, couponRuleVersion } from './coupon-pricing';
import {
  CouponStatus,
  type CheckoutCouponDto,
  type CouponListQueryDto,
  type CouponResponseDto,
  type SaveCouponDto,
} from './coupons.dto';
import { CouponsRepository } from './coupons.repository';

export interface CouponContext {
  userId: string;
  subtotal: number;
  shippingFee: number | null;
}
export interface ResolvedCoupon {
  coupon: Coupon;
  discountAmount: number;
}
type CouponClient = Pick<
  Prisma.TransactionClient,
  'coupon' | 'couponRedemption'
>;
function activeUsage(now = new Date()): Prisma.CouponRedemptionWhereInput {
  return {
    OR: [
      { status: 'CONSUMED' },
      { status: 'RESERVED', expiresAt: { gt: now } },
    ],
  };
}

@Injectable()
export class CouponsService {
  constructor(private readonly repository: CouponsRepository) {}

  private async usage(client: CouponClient, couponId: string, userId?: string) {
    return client.couponRedemption.count({
      where: { couponId, userId, ...activeUsage() },
    });
  }

  private async eligibility(
    client: CouponClient,
    coupon: Coupon,
    context: CouponContext,
  ): Promise<CheckoutCouponDto> {
    const now = new Date();
    let reason: [string, string] | null = null;
    if (!coupon.isActive)
      reason = ['COUPON_INACTIVE', 'Mã giảm giá đang tạm dừng.'];
    else if (coupon.startAt > now)
      reason = ['COUPON_UPCOMING', 'Mã giảm giá chưa đến thời gian áp dụng.'];
    else if (coupon.endAt <= now)
      reason = ['COUPON_EXPIRED', 'Mã giảm giá đã hết hạn.'];
    else if (context.subtotal < Number(coupon.minOrderAmount ?? 0))
      reason = ['COUPON_MIN_ORDER', 'Chưa đạt giá trị đơn hàng tối thiểu.'];
    else if (coupon.type === 'SHIPPING' && context.shippingFee === null)
      reason = [
        'COUPON_SHIPPING_REQUIRED',
        'Chọn địa chỉ để tính phí vận chuyển trước.',
      ];
    else if (coupon.type === 'SHIPPING' && context.shippingFee === 0)
      reason = [
        'COUPON_ZERO_SHIPPING',
        'Đơn hàng hiện không có phí vận chuyển.',
      ];
    else if (
      coupon.usageLimit !== null &&
      (await this.usage(client, coupon.id)) >= coupon.usageLimit
    )
      reason = ['COUPON_EXHAUSTED', 'Mã giảm giá đã hết lượt sử dụng.'];
    else if (
      coupon.usageLimitPerUser !== null &&
      (await this.usage(client, coupon.id, context.userId)) >=
        coupon.usageLimitPerUser
    )
      reason = ['COUPON_USER_LIMIT', 'Bạn đã đạt giới hạn sử dụng mã này.'];
    return {
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      type: coupon.type,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      minOrderAmount: Number(coupon.minOrderAmount ?? 0),
      maxDiscount:
        coupon.maxDiscount === null ? null : Number(coupon.maxDiscount),
      discountAmount: reason
        ? 0
        : couponDiscount(
            coupon,
            coupon.type === 'ORDER' ? context.subtotal : context.shippingFee!,
          ),
      selectable: !reason,
      reasonCode: reason?.[0] ?? null,
      reasonMessage: reason?.[1] ?? null,
    };
  }

  async publicList(
    context: CouponContext,
    selected: ResolvedCoupon[] = [],
  ): Promise<CheckoutCouponDto[]> {
    const coupons = await this.repository.client.coupon.findMany({
      where: { visibility: 'PUBLIC' },
      orderBy: [{ isActive: 'desc' }, { endAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    const rows = new Map(coupons.map((coupon) => [coupon.id, coupon]));
    for (const { coupon } of selected) rows.set(coupon.id, coupon);
    return Promise.all(
      [...rows.values()].map((coupon) =>
        this.eligibility(this.repository.client, coupon, context),
      ),
    );
  }

  async resolve(
    context: CouponContext,
    selections: {
      orderCouponCode?: string;
      shippingCouponCode?: string;
      couponCode?: string;
    },
    client: CouponClient = this.repository.client,
  ): Promise<ResolvedCoupon[]> {
    if (selections.couponCode !== undefined) {
      const entered = await client.coupon.findUnique({
        where: { code: selections.couponCode.trim().toUpperCase() },
      });
      if (!entered)
        throw new ConflictException({
          code: 'COUPON_INVALID',
          message: 'Mã giảm giá không hợp lệ.',
        });
      selections = {
        ...selections,
        [entered.type === 'ORDER' ? 'orderCouponCode' : 'shippingCouponCode']:
          entered.code,
      };
    }
    const resolved: ResolvedCoupon[] = [];
    for (const [type, input] of [
      ['ORDER', selections.orderCouponCode],
      ['SHIPPING', selections.shippingCouponCode],
    ] as const) {
      if (input === undefined) continue;
      const code = input.trim().toUpperCase();
      const coupon = await client.coupon.findUnique({ where: { code } });
      if (!coupon || coupon.type !== type)
        throw new ConflictException({
          code: 'COUPON_INVALID',
          message: 'Mã giảm giá không hợp lệ hoặc không đúng loại voucher.',
        });
      const result = await this.eligibility(client, coupon, context);
      if (!result.selectable)
        throw new ConflictException({
          code: result.reasonCode,
          message: `${result.reasonMessage} Vui lòng chọn lại voucher.`,
        });
      resolved.push({ coupon, discountAmount: result.discountAmount });
    }
    return resolved;
  }

  async redeem(
    tx: Prisma.TransactionClient,
    orderId: string,
    context: CouponContext,
    selections: ResolvedCoupon[],
    expiresAt: Date | null,
  ): Promise<void> {
    if (!selections.length) return;
    const ids = selections.map(({ coupon }) => coupon.id).sort();
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM coupons WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
    );
    const now = new Date();
    for (const selected of selections) {
      const current = await tx.coupon.findUniqueOrThrow({
        where: { id: selected.coupon.id },
      });
      if (couponRuleVersion(current) !== couponRuleVersion(selected.coupon))
        throw new ConflictException({
          code: 'CHECKOUT_PREVIEW_CHANGED',
          message:
            'Voucher đã thay đổi. Vui lòng cập nhật và xác nhận lại đơn hàng.',
        });
      const result = await this.eligibility(tx, current, context);
      if (
        !result.selectable ||
        result.discountAmount !== selected.discountAmount
      )
        throw new ConflictException({
          code: result.reasonCode ?? 'CHECKOUT_PREVIEW_CHANGED',
          message:
            result.reasonMessage ??
            'Ưu đãi đã thay đổi. Vui lòng xác nhận lại.',
        });
      await tx.couponRedemption.create({
        data: {
          couponId: current.id,
          orderId,
          userId: context.userId,
          couponType: current.type,
          couponCodeSnapshot: current.code,
          appliedDiscountAmount: result.discountAmount,
          status: expiresAt ? 'RESERVED' : 'CONSUMED',
          reservedAt: expiresAt ? now : null,
          consumedAt: expiresAt ? null : now,
          expiresAt,
        },
      });
    }
  }

  private validate(dto: SaveCouponDto): void {
    const errors: string[] = [];
    if (new Date(dto.startAt) >= new Date(dto.endAt))
      errors.push('Thời điểm kết thúc phải sau thời điểm bắt đầu.');
    if (dto.discountType === 'PERCENTAGE' && dto.discountValue > 100)
      errors.push('Phần trăm giảm phải lớn hơn 0 và không vượt quá 100.');
    if (
      dto.discountType === 'FIXED_AMOUNT' &&
      !Number.isSafeInteger(dto.discountValue)
    )
      errors.push('Số tiền giảm phải là số nguyên VND.');
    if (
      dto.usageLimit &&
      dto.usageLimitPerUser &&
      dto.usageLimitPerUser > dto.usageLimit
    )
      errors.push('Giới hạn mỗi người không được vượt tổng lượt.');
    if (
      dto.discountType === 'FIXED_AMOUNT' &&
      dto.maxDiscount != null &&
      dto.maxDiscount > dto.discountValue
    )
      errors.push('Mức giảm tối đa không được vượt số tiền giảm.');
    if (!dto.name.trim()) errors.push('Vui lòng nhập tên ưu đãi.');
    if (errors.length)
      throw new BadRequestException({
        code: 'COUPON_VALIDATION',
        message: errors.join(' '),
      });
  }

  private async response(
    client: CouponClient,
    coupon: Coupon,
  ): Promise<CouponResponseDto> {
    const groups = await client.couponRedemption.groupBy({
      by: ['status'],
      where: { couponId: coupon.id, ...activeUsage() },
      _count: true,
    });
    const consumed = groups.find((g) => g.status === 'CONSUMED')?._count ?? 0;
    const reserved = groups.find((g) => g.status === 'RESERVED')?._count ?? 0;
    const now = new Date();
    const status = !coupon.isActive
      ? CouponStatus.INACTIVE
      : coupon.startAt > now
        ? CouponStatus.UPCOMING
        : coupon.endAt <= now
          ? CouponStatus.EXPIRED
          : coupon.usageLimit !== null &&
              consumed + reserved >= coupon.usageLimit
            ? CouponStatus.EXHAUSTED
            : CouponStatus.ACTIVE;
    return {
      ...coupon,
      discountValue: Number(coupon.discountValue),
      minOrderAmount:
        coupon.minOrderAmount === null ? null : Number(coupon.minOrderAmount),
      maxDiscount:
        coupon.maxDiscount === null ? null : Number(coupon.maxDiscount),
      startAt: coupon.startAt.toISOString(),
      endAt: coupon.endAt.toISOString(),
      updatedAt: coupon.updatedAt.toISOString(),
      createdAt: coupon.createdAt.toISOString(),
      consumed,
      reserved,
      status,
      remaining:
        coupon.usageLimit === null
          ? null
          : Math.max(0, coupon.usageLimit - consumed - reserved),
    };
  }

  async list(query: CouponListQueryDto) {
    const now = new Date();
    const status = query.status;
    let quotaIds: string[] | undefined;
    if (status === CouponStatus.ACTIVE || status === CouponStatus.EXHAUSTED) {
      const rows = await this.repository.client.$queryRaw<
        Array<{ id: string }>
      >(
        Prisma.sql`SELECT c.id FROM coupons c WHERE c.usage_limit IS NOT NULL AND c.usage_limit <= (SELECT count(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id AND (r.status = 'CONSUMED' OR (r.status = 'RESERVED' AND r.expires_at > ${now})))`,
      );
      quotaIds = rows.map((row) => row.id);
    }
    const where: Prisma.CouponWhereInput = {
      type: query.type,
      visibility: query.visibility,
      discountType: query.discountType,
      ...(query.search?.trim()
        ? {
            OR: [
              { code: { contains: query.search.trim(), mode: 'insensitive' } },
              { name: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status === CouponStatus.INACTIVE
        ? { isActive: false }
        : status
          ? { isActive: true }
          : {}),
      ...(status === CouponStatus.UPCOMING ? { startAt: { gt: now } } : {}),
      ...(status === CouponStatus.EXPIRED
        ? { startAt: { lte: now }, endAt: { lte: now } }
        : {}),
      ...(status === CouponStatus.ACTIVE || status === CouponStatus.EXHAUSTED
        ? {
            startAt: { lte: now },
            endAt: { gt: now },
            id:
              status === CouponStatus.EXHAUSTED
                ? { in: quotaIds }
                : { notIn: quotaIds },
          }
        : {}),
    };
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [rows, totalItems] = await Promise.all([
      this.repository.client.coupon.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
          { id: 'asc' },
        ],
      }),
      this.repository.client.coupon.count({ where }),
    ]);
    return {
      items: await Promise.all(
        rows.map((row) => this.response(this.repository.client, row)),
      ),
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    };
  }

  async detail(id: string) {
    const coupon = await this.repository.client.coupon.findUnique({
      where: { id },
    });
    if (!coupon)
      throw new NotFoundException({
        code: 'COUPON_NOT_FOUND',
        message: 'Không tìm thấy mã giảm giá.',
      });
    return this.response(this.repository.client, coupon);
  }

  async save(dto: SaveCouponDto, id?: string) {
    this.validate(dto);
    try {
      return await this.repository.transaction(async (tx) => {
        let newlyEligible = !id;
        if (id) {
          await tx.$queryRaw`SELECT id FROM coupons WHERE id = ${id} FOR UPDATE`;
          const old = await tx.coupon.findUnique({ where: { id } });
          if (!old)
            throw new NotFoundException({
              code: 'COUPON_NOT_FOUND',
              message: 'Không tìm thấy mã giảm giá.',
            });
          newlyEligible =
            (old.visibility !== 'PUBLIC' && dto.visibility === 'PUBLIC') ||
            (!old.isActive && dto.isActive);
          const used = await tx.couponRedemption.count({
            where: { couponId: id },
          });
          if (used && (old.code !== dto.code || old.type !== dto.type))
            throw new ConflictException({
              code: 'COUPON_HISTORY_LOCKED',
              message: 'Mã đã có lịch sử: không thể đổi mã hoặc loại voucher.',
            });
          if (
            dto.usageLimit != null &&
            (await this.usage(tx, id)) > dto.usageLimit
          )
            throw new ConflictException({
              code: 'COUPON_QUOTA_CONFLICT',
              message: 'Giới hạn mới thấp hơn số lượt đã dùng và đang giữ.',
            });
        }
        const data = {
          ...dto,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          startAt: new Date(dto.startAt),
          endAt: new Date(dto.endAt),
          minOrderAmount: dto.minOrderAmount ?? null,
          maxDiscount: dto.maxDiscount ?? null,
          usageLimit: dto.usageLimit ?? null,
          usageLimitPerUser: dto.usageLimitPerUser ?? null,
        };
        const coupon = id
          ? await tx.coupon.update({ where: { id }, data })
          : await tx.coupon.create({ data });
        await schedulePromotion(
          tx,
          'COUPON_ACTIVE',
          coupon.id,
          coupon.startAt,
          newlyEligible,
        );
        return this.response(tx, coupon);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          code: 'COUPON_CODE_EXISTS',
          message: 'Mã giảm giá đã tồn tại.',
        });
      throw error;
    }
  }

  async setActive(id: string, isActive: boolean) {
    const old = await this.detail(id);
    return this.repository.transaction(async (tx) => {
      const coupon = await tx.coupon.update({
        where: { id },
        data: { isActive },
      });
      await schedulePromotion(
        tx,
        'COUPON_ACTIVE',
        coupon.id,
        coupon.startAt,
        isActive && !old.isActive,
      );
      return this.response(tx, coupon);
    });
  }
}
