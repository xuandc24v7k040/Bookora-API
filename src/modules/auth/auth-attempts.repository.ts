import { Injectable } from '@nestjs/common';
import { AuthAttemptType, Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class AuthAttemptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(type: AuthAttemptType, key: string) {
    return this.prisma.authAttempt.findUnique({
      where: {
        type_key: {
          type,
          key: key.toLowerCase(),
        },
      },
    });
  }

  create(data: Prisma.AuthAttemptCreateInput) {
    return this.prisma.authAttempt.create({ data });
  }

  update(id: string, data: Prisma.AuthAttemptUpdateInput) {
    return this.prisma.authAttempt.update({
      where: { id },
      data,
    });
  }
}
