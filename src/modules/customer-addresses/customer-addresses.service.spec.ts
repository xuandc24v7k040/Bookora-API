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
});
