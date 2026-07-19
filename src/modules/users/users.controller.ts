import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
  ResponseMessage,
  UlidParam,
} from '../../common/decorators';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  UsersQueryDto,
} from './dto';
import { UsersService } from './users.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { Permissions, PermissionsGuard } from '../authorization';

@ApiTags('users')
@ApiSecurity('accessToken')
@Controller('users')
@UseGuards(JwtAccessGuard, CsrfGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Permissions('users.create')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Tạo người dùng' })
  @ApiBaseResponse(UserResponseDto, {
    status: 201,
    description: 'Tạo người dùng thành công',
  })
  @ResponseMessage('Tạo người dùng thành công')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.usersService.create(actor, createUserDto);
  }

  @Get()
  @Permissions('users.read')
  @ApiOperation({ summary: 'Lấy danh sách người dùng' })
  @ApiPaginatedResponse(UserResponseDto, 'Lấy danh sách người dùng thành công')
  @ResponseMessage('Lấy danh sách người dùng thành công')
  findAll(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: UsersQueryDto,
  ) {
    return this.usersService.findAll(actor, query);
  }

  @Get(':id')
  @Permissions('users.read')
  @ApiOperation({ summary: 'Lấy người dùng theo id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'Lấy người dùng thành công',
  })
  @ResponseMessage('Lấy người dùng thành công')
  findOne(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('id') id: string,
  ) {
    return this.usersService.findOne(actor, id);
  }

  @Patch(':id/activate')
  @Permissions('users.update')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Kích hoạt lại người dùng theo id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'Kích hoạt người dùng thành công',
  })
  @ResponseMessage('Kích hoạt người dùng thành công')
  activate(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('id') id: string,
  ) {
    return this.usersService.activate(actor, id);
  }

  @Patch(':id')
  @Permissions('users.update')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Cập nhật người dùng theo id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'Cập nhật người dùng thành công',
  })
  @ResponseMessage('Cập nhật người dùng thành công')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(actor, id, updateUserDto);
  }

  @Delete(':id')
  @Permissions('users.delete')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Khóa tài khoản người dùng theo id' })
  @ApiBaseResponse(UserResponseDto, {
    description: 'Khóa tài khoản người dùng thành công',
  })
  @ResponseMessage('Khóa tài khoản người dùng thành công')
  remove(@CurrentUser() actor: AuthenticatedUser, @UlidParam('id') id: string) {
    return this.usersService.remove(actor, id);
  }
}
