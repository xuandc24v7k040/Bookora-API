import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiBaseResponse,
  ResponseMessage,
  UlidParam,
} from '@/common/decorators';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { CustomerAddressesService } from './customer-addresses.service';
import {
  CreateCustomerAddressDto,
  CustomerAddressDeleteResponseDto,
  CustomerAddressResponseDto,
  UpdateCustomerAddressDto,
} from './dto';

const ApiCustomerAddressErrors = () =>
  applyDecorators(
    ...[400, 401, 403, 404, 409, 503].map((status) =>
      ApiResponse({
        status,
        schema: { $ref: '#/components/schemas/ErrorResponseDto' },
      }),
    ),
  );

@ApiTags('customer-addresses')
@ApiSecurity('accessToken')
@ApiCustomerAddressErrors()
@Controller('account/addresses')
@UseGuards(JwtAccessGuard, CsrfGuard)
export class CustomerAddressesController {
  constructor(private readonly service: CustomerAddressesService) {}

  @Get()
  @ApiOperation({
    operationId: 'customerAddressesList',
    summary: 'Lấy địa chỉ của khách hàng hiện tại',
  })
  @ApiBaseResponse(CustomerAddressResponseDto, {
    isArray: true,
    description: 'Lấy danh sách địa chỉ thành công',
  })
  @ResponseMessage('Lấy danh sách địa chỉ thành công')
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.service.list(actor);
  }

  @Post()
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerAddressesCreate',
    summary: 'Thêm địa chỉ',
  })
  @ApiBaseResponse(CustomerAddressResponseDto, {
    status: 201,
    description: 'Thêm địa chỉ thành công',
  })
  @ResponseMessage('Thêm địa chỉ thành công')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    return this.service.create(actor, dto);
  }

  @Patch(':addressId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerAddressesUpdate',
    summary: 'Cập nhật địa chỉ',
  })
  @ApiBaseResponse(CustomerAddressResponseDto, {
    description: 'Cập nhật địa chỉ thành công',
  })
  @ResponseMessage('Cập nhật địa chỉ thành công')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('addressId') addressId: string,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    return this.service.update(actor, addressId, dto);
  }

  @Post(':addressId/set-default')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerAddressesSetDefault',
    summary: 'Đặt địa chỉ mặc định',
  })
  @ApiBaseResponse(CustomerAddressResponseDto, {
    description: 'Đặt địa chỉ mặc định thành công',
  })
  @ResponseMessage('Đặt địa chỉ mặc định thành công')
  setDefault(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('addressId') addressId: string,
  ) {
    return this.service.setDefault(actor, addressId);
  }

  @Delete(':addressId')
  @ApiSecurity('csrf')
  @ApiOperation({
    operationId: 'customerAddressesDelete',
    summary: 'Xóa địa chỉ',
  })
  @ApiBaseResponse(CustomerAddressDeleteResponseDto, {
    description: 'Xóa địa chỉ thành công',
  })
  @ResponseMessage('Xóa địa chỉ thành công')
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam('addressId') addressId: string,
  ) {
    return this.service.remove(actor, addressId);
  }
}
