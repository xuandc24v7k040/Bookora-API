import { Injectable } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';

const profileSelect = {
  id: true,
  email: true,
  passwordHash: true,
  fullName: true,
  phone: true,
  gender: true,
  birthday: true,
  avatarUrl: true,
  provider: true,
  createdAt: true,
  updatedAt: true,
  addresses: {
    where: { isDefault: true },
    take: 1,
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class CustomerAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });
  }

  updateProfile(
    userId: string,
    data: Prisma.UserUpdateInput,
    defaultAddressId?: string,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      if (defaultAddressId !== undefined) {
        const address = await tx.userAddress.findFirst({
          where: { id: defaultAddressId, userId },
          select: { id: true },
        });
        if (!address) return null;
        await tx.userAddress.updateMany({
          where: { userId, isDefault: true, id: { not: defaultAddressId } },
          data: { isDefault: false },
        });
        await tx.userAddress.update({
          where: { id: defaultAddressId },
          data: { isDefault: true },
        });
      }
      return tx.user.update({
        where: { id: userId },
        data,
        select: profileSelect,
      });
    });
  }

  updateAvatar(userId: string, avatarUrl: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: profileSelect,
    });
  }
}
