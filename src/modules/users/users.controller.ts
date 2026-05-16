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
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  UsersQueryDto,
} from './dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo người dùng' })
  @ApiBaseResponse(UserResponseDto, {
    status: 201,
    description: 'Tạo người dùng thành công',
  })
  @ResponseMessage('Tạo người dùng thành công')
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách người dùng' })
  @ApiPaginatedResponse(UserResponseDto, 'Lấy danh sách người dùng thành công')
  @ResponseMessage('Lấy danh sách người dùng thành công')
  findAll(@Query() query: UsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy người dùng theo id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'Lấy người dùng thành công',
  })
  @ResponseMessage('Lấy người dùng thành công')
  findOne(@ObjectIdParam('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật người dùng theo id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'Cập nhật người dùng thành công',
  })
  @ResponseMessage('Cập nhật người dùng thành công')
  update(
    @ObjectIdParam('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa người dùng theo id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'Xóa người dùng thành công',
  })
  @ResponseMessage('Xóa người dùng thành công')
  remove(@ObjectIdParam('id') id: string) {
    return this.usersService.remove(id);
  }
}
