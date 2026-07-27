import { Injectable } from '@nestjs/common';
import { Prisma, type OrderStatus } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import type { AdminOrderListQueryDto } from './dto';

const listInclude = {
  user: { select: { fullName: true, email: true } },
  payment: { select: { method: true, status: true } },
  items: { select: { quantity: true } },
} as const satisfies Prisma.OrderInclude;

export const adminOrderDetailInclude = {
  user: { select: { id: true, fullName: true, email: true, phone: true } },
  branch: { select: { id: true, name: true, address: true } },
  items: true,
  payment: {
    include: { transactions: { orderBy: { createdAt: 'asc' as const } } },
  },
  statusHistories: {
    include: { branch: { select: { name: true } } },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} as const satisfies Prisma.OrderInclude;

export type AdminOrderListRecord = Prisma.OrderGetPayload<{
  include: typeof listInclude;
}>;
export type AdminOrderDetailRecord = Prisma.OrderGetPayload<{
  include: typeof adminOrderDetailInclude;
}>;

function startOfVietnamDate(value: string): Date {
  return new Date(`${value}T00:00:00+07:00`);
}

function endExclusiveOfVietnamDate(value: string): Date {
  return new Date(startOfVietnamDate(value).getTime() + 86_400_000);
}

@Injectable()
export class AdminOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(branchId: string, query: AdminOrderListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();
    const where: Prisma.OrderWhereInput = {
      branchId,
      status: query.status?.length ? { in: query.status } : undefined,
      payment:
        query.paymentStatus?.length || query.paymentMethod?.length
          ? {
              is: {
                status: query.paymentStatus?.length
                  ? { in: query.paymentStatus }
                  : undefined,
                method: query.paymentMethod?.length
                  ? { in: query.paymentMethod }
                  : undefined,
              },
            }
          : undefined,
      placedAt:
        query.dateFrom || query.dateTo
          ? {
              gte: query.dateFrom
                ? startOfVietnamDate(query.dateFrom)
                : undefined,
              lt: query.dateTo
                ? endExclusiveOfVietnamDate(query.dateTo)
                : undefined,
            }
          : undefined,
      OR: search
        ? [
            { orderCode: { contains: search, mode: 'insensitive' } },
            { receiverName: { contains: search, mode: 'insensitive' } },
            { receiverPhone: { contains: search, mode: 'insensitive' } },
            { user: { fullName: { contains: search, mode: 'insensitive' } } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
            {
              items: {
                some: {
                  OR: [
                    { productName: { contains: search, mode: 'insensitive' } },
                    { sku: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ]
        : undefined,
    };
    const sortBy = query.sortBy ?? 'placedAt';
    const sortOrder = query.sortOrder ?? 'desc';
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: listInclude,
        orderBy: [{ [sortBy]: sortOrder }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  detail(branchId: string, orderId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, branchId },
      include: adminOrderDetailInclude,
    });
  }

  transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  findCancellable(
    tx: Prisma.TransactionClient,
    branchId: string,
    orderId: string,
  ) {
    return tx.order.findFirst({
      where: { id: orderId, branchId },
      include: {
        items: true,
        payment: {
          include: {
            transactions: { orderBy: { createdAt: 'desc' as const } },
          },
        },
      },
    });
  }

  async transition(
    tx: Prisma.TransactionClient,
    orderId: string,
    currentStatus: OrderStatus,
    targetStatus: OrderStatus,
  ): Promise<boolean> {
    const result = await tx.order.updateMany({
      where: { id: orderId, status: currentStatus },
      data: { status: targetStatus },
    });
    return result.count === 1;
  }
}
