import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';

@Injectable()
export class PasswordResetTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByHash(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  createReplacingActive(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`,
      );
      await tx.passwordResetToken.updateMany({
        where: {
          userId: input.userId,
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: input.now },
      });
      return tx.passwordResetToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      });
    });
  }

  revokeIfActive(id: string, revokedAt: Date) {
    return this.prisma.passwordResetToken.updateMany({
      where: { id, usedAt: null, revokedAt: null },
      data: { revokedAt },
    });
  }
}
