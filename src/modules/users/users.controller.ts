import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
  ObjectIdParam,
  ResponseMessage,
} from '../../common/decorators';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersQueryDto } from './dto/users-query.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  @ApiBaseResponse(UserResponseDto, {
    status: 201,
    description: 'User created successfully',
  })
  @ResponseMessage('User created successfully')
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get users' })
  @ApiPaginatedResponse(UserResponseDto, 'Users fetched successfully')
  @ResponseMessage('Users fetched successfully')
  findAll(@Query() query: UsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'User fetched successfully',
  })
  @ResponseMessage('User fetched successfully')
  findOne(@ObjectIdParam('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user by id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'User updated successfully',
  })
  @ResponseMessage('User updated successfully')
  update(
    @ObjectIdParam('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user by id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'User deleted successfully',
  })
  @ResponseMessage('User deleted successfully')
  remove(@ObjectIdParam('id') id: string) {
    return this.usersService.remove(id);
  }
}
