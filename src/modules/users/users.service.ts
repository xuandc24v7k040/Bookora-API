import { Injectable, NotFoundException } from '@nestjs/common';
import { type QueryFilter } from 'mongoose';
import { PaginatedResponseDto } from '../../common/dto';
import {
  getMongoSortOrder,
  getPaginationOptions,
  type MongoSortOrder,
} from '../../common/utils/pagination.util';
import type { UserDocument } from '../../database/schemas/users/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersQueryDto, UsersSortField } from './dto/users-query.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  create(createUserDto: CreateUserDto) {
    return this.usersRepository.create(createUserDto);
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
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.usersRepository.findOneAndUpdate(
      { _id: id },
      updateUserDto,
    );

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async remove(id: string) {
    const user = await this.usersRepository.findOneAndDelete({ _id: id });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
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
      $or: [{ email: searchRegex }, { name: searchRegex }],
    };
  }
}
