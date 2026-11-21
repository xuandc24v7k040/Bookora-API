import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { RealtimePublisher } from '@/modules/realtime/realtime-publisher';
import { canReceiveNotifications } from './notification-access';
import {
  NotificationSort,
  type NotificationsQueryDto,
} from './notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: RealtimePublisher,
  ) {}

  private scope(
    actor: AuthenticatedUser,
    selectedBranch?: string,
  ): Prisma.NotificationWhereInput {
    if (actor.type === 'CUSTOMER') return { userId: actor.id, branchId: null };
    if (actor.type !== 'BRANCH' || actor.isSuperAdmin)
      throw new ForbiddenException(
        'Tài khoản không có thông báo trong phạm vi này.',
      );
    if (!selectedBranch)
      throw new BadRequestException('Vui lòng chọn chi nhánh.');
    if (!canReceiveNotifications(actor, selectedBranch))
      throw new ForbiddenException(
        'Bạn không có quyền xử lý đơn tại chi nhánh này.',
      );
    return { userId: actor.id, branchId: selectedBranch };
  }

  async list(
    actor: AuthenticatedUser,
    branch: string | undefined,
    query: NotificationsQueryDto,
  ) {
    const page = query.page ?? 1,
      limit = query.limit ?? 10;
    const search = query.search?.trim();
    const where: Prisma.NotificationWhereInput = {
      ...this.scope(actor, branch),
      category: query.category,
      readAt: query.unreadOnly ? null : undefined,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { content: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const sort = query.sort === NotificationSort.OLDEST ? 'asc' : 'desc';
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        select: {
          id: true,
          type: true,
          category: true,
          title: true,
          content: true,
          branchId: true,
          referenceType: true,
          referenceId: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: sort }, { id: sort }],
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    const publicCoupons = await this.prisma.coupon.findMany({
      where: {
        id: {
          in: items
            .filter((item) => item.referenceType === 'COUPON')
            .map((item) => item.referenceId),
        },
        visibility: 'PUBLIC',
      },
      select: { id: true, code: true },
    });
    const codes = new Map(
      publicCoupons.map((coupon) => [coupon.id, coupon.code]),
    );
    return {
      items: items.map((item) =>
        item.referenceType === 'COUPON' && !codes.has(item.referenceId)
          ? {
              ...item,
              title: 'Ưu đãi đã thay đổi',
              content: 'Ưu đãi này hiện không còn được công khai.',
              referenceType: '',
              couponCode: null,
            }
          : { ...item, couponCode: codes.get(item.referenceId) ?? null },
      ),
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    };
  }
  async count(actor: AuthenticatedUser, branch?: string) {
    return {
      count: await this.prisma.notification.count({
        where: { ...this.scope(actor, branch), readAt: null },
      }),
    };
  }
  async markRead(
    actor: AuthenticatedUser,
    branch: string | undefined,
    id?: string,
  ) {
    const where = { ...this.scope(actor, branch), ...(id ? { id } : {}) };
    const result = await this.prisma.$transaction(async (tx) => {
      if (
        id &&
        !(await tx.notification.findFirst({ where, select: { id: true } }))
      )
        throw new NotFoundException('Không tìm thấy thông báo.');
      return tx.notification.updateMany({
        where: { ...where, readAt: null },
        data: { readAt: new Date() },
      });
    });
    await this.publisher
      .publishToUser(
        actor.id,
        {
          name: 'notification.changed',
          version: 1,
          data: { branchId: actor.type === 'BRANCH' ? branch : null },
        },
        (principal) =>
          canReceiveNotifications(
            principal,
            actor.type === 'BRANCH' ? branch! : null,
          ),
      )
      .catch(() => undefined);
    return { count: result.count };
  }
}
