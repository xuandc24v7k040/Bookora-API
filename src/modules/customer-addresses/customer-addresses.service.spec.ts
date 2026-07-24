import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  CustomerAddressLimitError,
  CustomerAddressesRepository,
} from './customer-addresses.repository';
import { CustomerAddressesService } from './customer-addresses.service';

const actor = {
  id: '01K0000000000000000000000A',
  type: UserType.CUSTOMER,
} as AuthenticatedUser;

describe('CustomerAddressesService', () => {
  const repository = {
    findOwned: jest.fn(),
    create: jest.fn(),
    updateOwned: jest.fn(),
  };
  const administrativeUnits = { resolve: jest.fn() };
  const service = new CustomerAddressesService(
    repository as unknown as CustomerAddressesRepository,
    administrativeUnits as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects a ward outside the selected province', async () => {
    administrativeUnits.resolve.mockResolvedValue({
      province: { code: 92, name: 'Cần Thơ' },
      ward: null,
    });
    await expect(
      service.create(actor, {
        recipientName: 'Nguyễn Văn A',
        phone: '0901234567',
        provinceCode: 92,
        wardCode: 1,
        addressDetail: 'Số 1 đường A',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_ADDRESS_WARD_PROVINCE_MISMATCH' },
    });
  });

  it('maps the atomic ten-address limit to a stable business error', async () => {
    administrativeUnits.resolve.mockResolvedValue({
      province: { code: 92, name: 'Cần Thơ' },
      ward: { code: 31117, name: 'Phường An Bình' },
    });
    repository.create.mockRejectedValue(new CustomerAddressLimitError());
    await expect(
      service.create(actor, {
        recipientName: 'Nguyễn Văn A',
        phone: '0901234567',
        provinceCode: 92,
        wardCode: 31117,
        addressDetail: 'Số 1 đường A',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not reveal an address owned by another customer', async () => {
    repository.findOwned.mockResolvedValue(null);
    await expect(
      service.update(actor, '01K0000000000000000000000B', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clears verified GHN metadata when address fields change', async () => {
    const current = {
      id: '01K0000000000000000000000B',
      provinceCode: 92,
      province: 'Thành phố Cần Thơ',
      wardCode: 31135,
      ward: 'Phường Ninh Kiều',
      detail: 'Hẻm tổ 7',
      ghnProvinceId: 220,
      ghnDistrictId: 1572,
      ghnWardCode: '550307',
      ghnMappingVerifiedAt: new Date(),
    };
    repository.findOwned.mockResolvedValue(current);
    repository.updateOwned.mockImplementation(
      (_userId: string, _id: string, data: object) =>
        Promise.resolve({
          ...current,
          ...data,
          label: null,
          receiverName: 'Nguyễn Văn A',
          receiverPhone: '0901234567',
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    );
    administrativeUnits.resolve.mockResolvedValue({
      province: { code: 92, name: 'Thành phố Cần Thơ' },
      ward: { code: 31150, name: 'Phường An Bình' },
    });

    await service.update(actor, current.id, {
      wardCode: 31150,
      addressDetail: 'Số 1 đường A',
    });

    expect(repository.updateOwned).toHaveBeenCalledWith(
      actor.id,
      current.id,
      expect.objectContaining({
        latitude: null,
        longitude: null,
        ghnProvinceId: null,
        ghnDistrictId: null,
        ghnWardCode: null,
        ghnMappingVerifiedAt: null,
      }),
    );

    administrativeUnits.resolve.mockResolvedValue({
      province: { code: 92, name: 'Thành phố Cần Thơ' },
      ward: { code: 31135, name: 'Phường Ninh Kiều mới' },
    });
    await service.update(actor, current.id, {});
    expect(repository.updateOwned).toHaveBeenLastCalledWith(
      actor.id,
      current.id,
      expect.objectContaining({
        latitude: null,
        longitude: null,
        ghnProvinceId: null,
        ghnDistrictId: null,
        ghnWardCode: null,
        ghnMappingVerifiedAt: null,
      }),
    );
  });
});
