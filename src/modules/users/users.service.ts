import { Injectable, NotFoundException } from '@nestjs/common';
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
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  create(createUserDto: CreateUserDto) {
    return this.usersRepository.create({
      ...createUserDto,
      email: createUserDto.email.toLowerCase(),
    });
  }

  createForAuth(data: Prisma.UserCreateInput) {
    return this.usersRepository.createForAuth(data);
  }

  findByEmail(email: string, includeSecrets = false) {
    return this.usersRepository.findByEmail(email, includeSecrets);
  }

  updateAuthFields(id: string, update: Prisma.UserUpdateInput) {
    return this.usersRepository.updateAuthFields(id, update);
  }

  async findAll(query: UsersQueryDto) {
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

  async findOne(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng có id ${id}`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    try {
      return await this.usersRepository.update(id, updateUserDto);
    } catch {
      throw new NotFoundException(`Không tìm thấy người dùng có id ${id}`);
    }
  }

  async remove(id: string) {
    try {
      return await this.usersRepository.delete(id);
    } catch {
      throw new NotFoundException(`Không tìm thấy người dùng có id ${id}`);
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
