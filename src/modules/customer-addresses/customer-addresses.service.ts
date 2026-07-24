import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserType, type UserAddress } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { VietnamAdministrativeUnitsService } from '@/shared/administrative-divisions/vietnam-administrative-units.service';
import {
  CustomerAddressLimitError,
  CustomerAddressesRepository,
} from './customer-addresses.repository';
import type { CreateCustomerAddressDto, UpdateCustomerAddressDto } from './dto';

@Injectable()
export class CustomerAddressesService {
  constructor(
    private readonly repository: CustomerAddressesRepository,
    private readonly administrativeUnits: VietnamAdministrativeUnitsService,
  ) {}

  async list(actor: AuthenticatedUser) {
    this.assertCustomer(actor);
    return (await this.repository.list(actor.id)).map((item) =>
      this.toResponse(item),
    );
  }

  async create(actor: AuthenticatedUser, dto: CreateCustomerAddressDto) {
    this.assertCustomer(actor);
    const location = await this.resolveLocation(dto.provinceCode, dto.wardCode);
    let created: UserAddress;
    try {
      created = await this.repository.create(actor.id, {
        label: dto.label ?? null,
        receiverName: dto.recipientName,
        receiverPhone: dto.phone,
        provinceCode: dto.provinceCode,
        province: location.province.name,
        wardCode: dto.wardCode,
        ward: location.ward.name,
        detail: dto.addressDetail,
        isDefault: dto.isDefault ?? false,
      });
    } catch (error) {
      if (error instanceof CustomerAddressLimitError) {
        throw new BadRequestException({
          code: 'CUSTOMER_ADDRESS_LIMIT_REACHED',
          message: 'Bạn chỉ có thể lưu tối đa 10 địa chỉ giao hàng',
        });
      }
      throw error;
    }
    return this.toResponse(created);
  }

  async update(
    actor: AuthenticatedUser,
    addressId: string,
    dto: UpdateCustomerAddressDto,
  ) {
    this.assertCustomer(actor);
    const current = await this.repository.findOwned(actor.id, addressId);
    if (!current) this.notFound();
    const provinceCode = dto.provinceCode ?? current.provinceCode;
    const wardCode = dto.wardCode ?? current.wardCode;
    const location = await this.resolveLocation(provinceCode, wardCode);
    const invalidatesShippingMapping =
      provinceCode !== current.provinceCode ||
      wardCode !== current.wardCode ||
      location.province.name !== current.province ||
      location.ward.name !== current.ward ||
      (dto.addressDetail !== undefined && dto.addressDetail !== current.detail);
    const updated = await this.repository.updateOwned(actor.id, addressId, {
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.recipientName !== undefined
        ? { receiverName: dto.recipientName }
        : {}),
      ...(dto.phone !== undefined ? { receiverPhone: dto.phone } : {}),
      ...(dto.addressDetail !== undefined ? { detail: dto.addressDetail } : {}),
      provinceCode,
      province: location.province.name,
      wardCode,
      ward: location.ward.name,
      ...(invalidatesShippingMapping
        ? {
            latitude: null,
            longitude: null,
            ghnProvinceId: null,
            ghnDistrictId: null,
            ghnWardCode: null,
            ghnMappingVerifiedAt: null,
          }
        : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
    });
    if (!updated) this.notFound();
    return this.toResponse(updated);
  }

  async setDefault(actor: AuthenticatedUser, addressId: string) {
    this.assertCustomer(actor);
    const updated = await this.repository.setDefault(actor.id, addressId);
    if (!updated) this.notFound();
    return this.toResponse(updated);
  }

  async remove(actor: AuthenticatedUser, addressId: string) {
    this.assertCustomer(actor);
    const result = await this.repository.removeOwned(actor.id, addressId);
    if (!result) this.notFound();
    return {
      deletedAddressId: result.deleted.id,
      defaultAddress: result.promoted ? this.toResponse(result.promoted) : null,
    };
  }

  private async resolveLocation(provinceCode: number, wardCode: number) {
    const location = await this.administrativeUnits.resolve(
      provinceCode,
      wardCode,
    );
    if (!location.province) {
      throw new BadRequestException({
        code: 'CUSTOMER_ADDRESS_PROVINCE_INVALID',
        message: 'Tỉnh/Thành phố không hợp lệ',
      });
    }
    if (!location.ward) {
      throw new BadRequestException({
        code: 'CUSTOMER_ADDRESS_WARD_PROVINCE_MISMATCH',
        message: 'Phường/Xã không thuộc Tỉnh/Thành phố đã chọn',
      });
    }
    return { province: location.province, ward: location.ward };
  }

  private toResponse(address: UserAddress) {
    return {
      id: address.id,
      label: address.label,
      recipientName: address.receiverName,
      phone: address.receiverPhone,
      provinceCode: address.provinceCode,
      provinceName: address.province,
      wardCode: address.wardCode,
      wardName: address.ward,
      addressDetail: address.detail,
      formattedAddress: [address.detail, address.ward, address.province].join(
        ', ',
      ),
      isDefault: address.isDefault,
      createdAt: address.createdAt.toISOString(),
      updatedAt: address.updatedAt.toISOString(),
    };
  }

  private assertCustomer(actor: AuthenticatedUser) {
    if (actor.type !== UserType.CUSTOMER) {
      throw new ForbiddenException(
        'Chỉ khách hàng được quản lý địa chỉ cá nhân',
      );
    }
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'CUSTOMER_ADDRESS_NOT_FOUND',
      message: 'Không tìm thấy địa chỉ',
    });
  }
}
