import { Injectable, NotFoundException } from '@nestjs/common';
import { type QueryFilter } from 'mongoose';
import { PaginatedResponseDto } from '../../common/dto';
import {
  getMongoSortOrder,
  getPaginationOptions,
  type MongoSortOrder,
} from '../../common/utils/pagination.util';
import type {
  User,
  UserDocument,
} from '../../database/schemas/users/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersQueryDto, UsersSortField } from './dto/users-query.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  create(createUserDto: Partial<User>) {
    return this.usersRepository.create(createUserDto);
  }

  findByEmail(email: string, includeSecrets = false) {
    return this.usersRepository.findByEmail(email, includeSecrets);
  }

  async updateAuthFields(
    id: string,
    update: Partial<
      Pick<
        User,
        | 'refreshTokenHash'
        | 'failedLoginAttempts'
        | 'lockUntil'
        | 'provider'
        | 'googleId'
        | 'passwordHash'
        | 'fullName'
      >
    >,
  ) {
    return this.usersRepository.findOneAndUpdate({ _id: id }, update);
  }

  async findAll(query: UsersQueryDto) {
    const { page, limit, skip } = getPaginationOptions(query);
    const filter = this.buildUserFilter(query);
    const sortBy = query.sortBy ?? UsersSortField.CREATED_AT;
    const sort: Partial<Record<UsersSortField, MongoSortOrder>> = {
      [sortBy]: getMongoSortOrder(query.sortOrder),
    };

    const [users, total] = await Promise.all([
      this.usersRepository.find(filter, undefined, {
        limit,
        skip,
        sort,
      }),
      this.usersRepository.count(filter),
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
    const user = await this.usersRepository.findOneAndUpdate(
      { _id: id },
      updateUserDto,
    );

    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng có id ${id}`);
    }

    return user;
  }

  async remove(id: string) {
    const user = await this.usersRepository.findOneAndDelete({ _id: id });
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng có id ${id}`);
    }

    return user;
  }

  private buildUserFilter(query: UsersQueryDto): QueryFilter<UserDocument> {
    if (!query.search) {
      return {};
    }

    const searchRegex = {
      $regex: query.search,
      $options: 'i',
    };

    return {
      $or: [{ email: searchRegex }, { fullName: searchRegex }],
    };
  }
}
