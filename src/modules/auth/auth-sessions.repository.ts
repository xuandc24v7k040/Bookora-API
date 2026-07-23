import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class AuthSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AuthSessionUncheckedCreateInput) {
    return this.prisma.authSession.create({ data });
  }

  findActiveByIdAndUserIdWithUser(
    id: string,
    userId: string,
    now = new Date(),
  ) {
    return this.prisma.authSession.findFirst({
      where: {
        id,
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: { user: true },
    });
  }

  rotateIfCurrent(data: {
    id: string;
    userId: string;
    currentRefreshTokenHash: string;
    newRefreshTokenHash: string;
    expiresAt: Date;
    now?: Date;
  }) {
    return this.prisma.authSession.updateMany({
      where: {
        id: data.id,
        userId: data.userId,
        refreshTokenHash: data.currentRefreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: data.now ?? new Date() },
      },
      data: {
        refreshTokenHash: data.newRefreshTokenHash,
        expiresAt: data.expiresAt,
      },
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
    return this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
