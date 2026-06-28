import { Injectable } from '@nestjs/common';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { Prisma, UserType, type User } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  type: true,
  provider: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export class CustomerRoleConfigurationError extends Error {
  constructor() {
    super('Active system role CUSTOMER is not configured');
  }
}

export type CreateCustomerForAuthInput = Pick<
  Prisma.UserUncheckedCreateInput,
  'email' | 'fullName' | 'phone' | 'passwordHash' | 'provider' | 'googleId'
>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  createCustomerForAuth(data: CreateCustomerForAuthInput): Promise<User> {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const customerRole = await tx.role.findFirst({
        where: {
          code: 'CUSTOMER',
          type: UserType.CUSTOMER,
          isSystem: true,
          isActive: true,
        },
        select: { id: true },
      });

      if (!customerRole) {
        throw new CustomerRoleConfigurationError();
      }

      const user = await tx.user.create({
        data: { ...data, type: UserType.CUSTOMER },
      });
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: customerRole.id,
        },
      });

      return user;
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  findByEmail(email: string, includeSecrets = false) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      ...(includeSecrets ? {} : { select: publicUserSelect }),
    });
  }

  findMany(args: {
    where?: Prisma.UserWhereInput;
    skip?: number;
    take?: number;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }) {
    return this.prisma.user.findMany({ ...args, select: publicUserSelect });
  }

  count(where?: Prisma.UserWhereInput) {
    return this.prisma.user.count({ where });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: publicUserSelect,
    });
  }

  updateAuthFields(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  updateLastLoginAt(id: string, lastLoginAt: Date): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt },
    });
  }

  disableWithSessions(
    id: string,
    assertAllowed: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      await assertAllowed(tx);
      await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.user.update({
        where: { id },
        data: { isActive: false },
        select: publicUserSelect,
      });
    });
  }
}
