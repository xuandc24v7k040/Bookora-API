import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import { PaginatedResponseDto } from '@/common/dto';
import {
  getPaginationOptions,
  getPrismaSortOrder,
} from '@/common/utils/pagination.util';
import {
  CreateUserDto,
  UpdateUserDto,
  UsersQueryDto,
  UsersSortField,
} from './dto';
import {
  CustomerRoleConfigurationError,
  type CreateCustomerForAuthInput,
  UsersRepository,
} from './users.repository';
import { AuthProvider } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { SystemProtectionPolicy } from '../authorization';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly systemProtectionPolicy: SystemProtectionPolicy,
  ) {}

  async create(actor: AuthenticatedUser, createUserDto: CreateUserDto) {
    this.assertSuperAdmin(actor);
    const user = await this.createCustomerForAuth({
      ...createUserDto,
      email: createUserDto.email.toLowerCase(),
      provider: AuthProvider.LOCAL,
    });
    return this.findOne(actor, user.id);
  }

  async createCustomerForAuth(data: CreateCustomerForAuthInput) {
    try {
      return await this.usersRepository.createCustomerForAuth(data);
    } catch (error) {
      if (error instanceof CustomerRoleConfigurationError) {
        throw new InternalServerErrorException(
          'Cấu hình role CUSTOMER chưa sẵn sàng',
        );
      }

      throw error;
    }
  }

  findByEmail(email: string, includeSecrets = false) {
    return this.usersRepository.findByEmail(email, includeSecrets);
  }

  updateAuthFields(id: string, update: Prisma.UserUpdateInput) {
    return this.usersRepository.updateAuthFields(id, update);
  }

  updateLastLoginAt(id: string, lastLoginAt = new Date()) {
    return this.usersRepository.updateLastLoginAt(id, lastLoginAt);
  }

  async findAll(actor: AuthenticatedUser, query: UsersQueryDto) {
    this.assertSuperAdmin(actor);
    const { page, limit, skip } = getPaginationOptions(query);
    const where = this.buildUserFilter(query);
    const sortBy = query.sortBy ?? UsersSortField.CREATED_AT;
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [sortBy]: getPrismaSortOrder(query.sortOrder),
    };

    const [users, total] = await Promise.all([
      this.usersRepository.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.usersRepository.count(where),
    ]);

    return new PaginatedResponseDto(users, total, page, limit);
  }

  async findOne(actor: AuthenticatedUser, id: string) {
    this.assertSuperAdmin(actor);
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng có id ${id}`);
    }

    return user;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    updateUserDto: UpdateUserDto,
  ) {
    await this.findOne(actor, id);
    return this.usersRepository.update(id, updateUserDto);
  }

  async remove(actor: AuthenticatedUser, id: string) {
    this.assertSuperAdmin(actor);
    await this.findOne(actor, id);
    return this.usersRepository.disableWithSessions(id, async (tx) => {
      await this.systemProtectionPolicy.assertCanRemoveSuperAdmin(id, tx);
    });
  }

  private assertSuperAdmin(actor: AuthenticatedUser): void {
    if (!actor.isSuperAdmin) {
      throw new ForbiddenException('Chỉ Super Admin được quản lý Users API');
    }
  }

  private buildUserFilter(query: UsersQueryDto): Prisma.UserWhereInput {
    if (!query.search) {
      return {};
    }

    return {
      OR: [
        { email: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
      ],
    };
  }
}
