import { ConflictException } from '@nestjs/common';
import { type Prisma } from '@/generated/prisma/client';

export async function releaseCouponRedemptions(
  tx: Prisma.TransactionClient,
  orderId: string,
  now: Date,
): Promise<void> {
  await tx.couponRedemption.updateMany({
    where: { orderId, status: { in: ['RESERVED', 'CONSUMED'] } },
    data: { status: 'RELEASED', releasedAt: now },
  });
}

export async function assertCouponReservation(
  tx: Prisma.TransactionClient,
  orderId: string,
  through: Date,
): Promise<void> {
  const invalid = await tx.couponRedemption.count({
    where: {
      orderId,
      OR: [
        { status: 'RELEASED' },
        { status: 'RESERVED', expiresAt: { lte: through } },
      ],
    },
  });
  if (invalid)
    throw new ConflictException({
      code: 'COUPON_RESERVATION_EXPIRED',
      message: 'Thời hạn giữ voucher đã hết. Vui lòng tạo đơn hàng mới.',
    });
}

export async function consumeCouponRedemptions(
  tx: Prisma.TransactionClient,
  orderId: string,
  now: Date,
): Promise<void> {
  await assertCouponReservation(tx, orderId, now);
  await tx.couponRedemption.updateMany({
    where: { orderId, status: 'RESERVED' },
    data: { status: 'CONSUMED', consumedAt: now },
  });
}
