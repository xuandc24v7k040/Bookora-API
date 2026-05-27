import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class AuthSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AuthSessionUncheckedCreateInput) {
    return this.prisma.authSession.create({ data });
  }

  findActiveByUserIdWithUser(userId: string, now = new Date()) {
    return this.prisma.authSession.findFirst({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });
  }

  revokeActiveByUserId(userId: string, revokedAt = new Date()) {
    return this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt },
    });
  }

  update(id: string, data: Prisma.AuthSessionUpdateInput) {
    return this.prisma.authSession.update({
      where: { id },
      data,
    });
  }

  revoke(id: string) {
    return this.update(id, { revokedAt: new Date() });
  }
}
