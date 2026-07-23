import { Injectable } from '@nestjs/common';
import { Prisma, type UserAddress } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';

export class CustomerAddressLimitError extends Error {}

@Injectable()
export class CustomerAddressesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.userAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findOwned(userId: string, id: string) {
    return this.prisma.userAddress.findFirst({ where: { id, userId } });
  }

  create(
    userId: string,
    data: Omit<Prisma.UserAddressUncheckedCreateInput, 'userId'>,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const existingCount = await tx.userAddress.count({ where: { userId } });
      if (existingCount >= 10) throw new CustomerAddressLimitError();
      const isDefault = existingCount === 0 || data.isDefault === true;
      if (isDefault) {
        await tx.userAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.userAddress.create({
        data: { ...data, userId, isDefault },
      });
    });
  }

  updateOwned(userId: string, id: string, data: Prisma.UserAddressUpdateInput) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const current = await tx.userAddress.findFirst({ where: { id, userId } });
      if (!current) return null;
      const setDefault = data.isDefault === true;
      if (setDefault) {
        await tx.userAddress.updateMany({
          where: { userId, id: { not: id }, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.userAddress.update({
        where: { id },
        data: {
          ...data,
          ...(current.isDefault && data.isDefault === false
            ? { isDefault: true }
            : {}),
        },
      });
    });
  }

  setDefault(userId: string, id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const target = await tx.userAddress.findFirst({ where: { id, userId } });
      if (!target) return null;
      if (target.isDefault) return target;
      await tx.userAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      return tx.userAddress.update({
        where: { id },
        data: { isDefault: true },
      });
    });
  }

  removeOwned(userId: string, id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const target = await tx.userAddress.findFirst({ where: { id, userId } });
      if (!target) return null;
      await tx.userAddress.delete({ where: { id } });
      let promoted: UserAddress | null = null;
      if (target.isDefault) {
        const oldest = await tx.userAddress.findFirst({
          where: { userId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (oldest) {
          promoted = await tx.userAddress.update({
            where: { id: oldest.id },
            data: { isDefault: true },
          });
        }
      }
      return { deleted: target, promoted };
    });
  }
}
