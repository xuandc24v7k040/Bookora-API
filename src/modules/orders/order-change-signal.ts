import type { Prisma } from '@/generated/prisma/client';

export const ORDER_CHANGE_CHANNEL = 'bookora_order_changed';
export const ORDER_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** PostgreSQL delivers this hint only after the outer transaction commits. */
export async function signalOrderChange(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_notify(${ORDER_CHANGE_CHANNEL}, ${orderId})`;
}
