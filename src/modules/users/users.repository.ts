import { Injectable } from '@nestjs/common';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import { Prisma, UserType, type User } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  gender: true,
  birthday: true,
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

export class UserActivationRequiresActiveBranchError extends Error {
  constructor() {
    super(
      'BRANCH user requires an active assignment and one active primary branch',
    );
  }
}

export type CreateCustomerForAuthInput = Pick<
  Prisma.UserUncheckedCreateInput,
  | 'email'
  | 'fullName'
  | 'phone'
  | 'gender'
  | 'birthday'
  | 'passwordHash'
  | 'provider'
  | 'googleId'
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
    orderBy?:
      | Prisma.UserOrderByWithRelationInput
      | Prisma.UserOrderByWithRelationInput[];
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

  activate(id: string) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id },
        select: { id: true, type: true, isActive: true },
      });
      if (!user) {
        return null;
      }
      if (user.type === UserType.BRANCH) {
        const [activeAssignmentCount, activePrimaryCount] = await Promise.all([
          tx.userBranch.count({
            where: { userId: id, isActive: true, branch: { isActive: true } },
          }),
          tx.userBranch.count({
            where: {
              userId: id,
              isActive: true,
              isPrimary: true,
              branch: { isActive: true },
            },
          }),
        ]);
        if (activeAssignmentCount === 0 || activePrimaryCount !== 1) {
          throw new UserActivationRequiresActiveBranchError();
        }
      }

      return tx.user.update({
        where: { id },
        data: { isActive: true },
        select: publicUserSelect,
      });
    });
  }
}
