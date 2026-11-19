import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@/generated/prisma/client';

export function activeFlashUsage(
  now: Date,
): Prisma.FlashSaleAllocationWhereInput {
  return {
    OR: [
      { status: 'CONSUMED' },
      { status: 'RESERVED', expiresAt: { gt: now } },
    ],
  };
}

export async function assertFlashReservation(
  tx: Prisma.TransactionClient,
  orderId: string,
  through: Date,
): Promise<void> {
  const invalid = await tx.flashSaleAllocation.count({
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
      code: 'FLASH_SALE_RESERVATION_EXPIRED',
      message:
        'Thời hạn giữ suất Flash Sale đã hết. Vui lòng tạo đơn hàng mới.',
    });
}

export async function consumeFlashAllocations(
  tx: Prisma.TransactionClient,
  orderId: string,
  now: Date,
): Promise<void> {
  await assertFlashReservation(tx, orderId, now);
  await tx.flashSaleAllocation.updateMany({
    where: { orderId, status: 'RESERVED' },
    data: { status: 'CONSUMED', consumedAt: now },
  });
}

export async function releaseFlashAllocations(
  tx: Prisma.TransactionClient,
  orderId: string,
  now: Date,
): Promise<void> {
  await tx.flashSaleAllocation.updateMany({
    where: { orderId, status: { in: ['RESERVED', 'CONSUMED'] } },
    data: { status: 'RELEASED', releasedAt: now },
  });
}
