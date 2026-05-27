import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';

const publicUserSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  provider: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data, select: publicUserSelect });
  }

  createForAuth(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
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

  delete(id: string) {
    return this.prisma.user.delete({
      where: { id },
      select: publicUserSelect,
    });
  }
}
