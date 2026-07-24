import { ProductStatus, UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { CartValidationService } from '@/modules/cart/cart-validation.service';
import { InternalShippingFeeService } from '@/modules/shipping/internal-shipping-fee.service';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import {
  CheckoutRepository,
  type CheckoutCartRecord,
} from './checkout.repository';
import { CheckoutService } from './checkout.service';

const BRANCH_ID = '01KW40RP7VF4TCF39EDHH73VAS';
const CART_ITEM_ID = '01KY7EVAPRC2KXK38JEW4FMB2P';
const VARIANT_ID = '01KY2BG9FQ1X1C4RHQ64RV288D';

const actor = {
  id: '01KY0000000000000000000000',
  email: 'customer@gmail.com',
  fullName: 'Customer',
  phone: null,
  gender: null,
  birthday: null,
  avatarUrl: null,
  type: UserType.CUSTOMER,
  roles: [],
  permissions: [],
  globalRoles: [],
  globalPermissions: [],
  branchAssignments: [],
  allowedBranchIds: [],
  branches: [],
  primaryBranchId: null,
  maxRoleLevel: 0,
  isSuperAdmin: false,
  sessionId: 'session',
} satisfies AuthenticatedUser;

function cartFixture(): CheckoutCartRecord {
  return {
    id: '01KY6JGTGX8ZNHCCTVAVR5977P',
    userId: actor.id,
    branchId: BRANCH_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    branch: {
      id: BRANCH_ID,
      code: 'HG',
      name: 'Chi nhánh Hậu Giang',
      address: 'Hậu Giang',
      province: 'Hậu Giang',
      ward: 'Phường Vị Tân',
      latitude: null,
      longitude: null,
      isActive: true,
      ghnProvinceId: null,
      ghnDistrictId: null,
      ghnWardCode: null,
      ghnShopId: null,
      ghnMappingVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    items: [
      {
        id: CART_ITEM_ID,
        cartId: '01KY6JGTGX8ZNHCCTVAVR5977P',
        variantId: VARIANT_ID,
        quantity: 1,
        lastKnownUnitPrice: 120_000,
        createdAt: new Date(),
        updatedAt: new Date(),
        variant: {
          id: VARIANT_ID,
          productId: '01KY2BG9FQ1X1C4RHQ64RV288E',
          name: 'Bản tiêu chuẩn',
          sku: 'BOOK-1',
          isbn: null,
          publicationYear: null,
          pageCount: null,
          weightGram: null,
          packageSize: null,
          originalPrice: 120_000,
          salePrice: null,
          saleStartAt: null,
          saleEndAt: null,
          isDefault: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          product: {
            id: '01KY2BG9FQ1X1C4RHQ64RV288E',
            name: 'Sách kiểm thử',
            slug: 'sach-kiem-thu',
            status: ProductStatus.ACTIVE,
            shortDescription: null,
            description: null,
            supplierId: null,
            publisherId: null,
            releaseDate: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            media: [],
          },
          media: [],
          optionValues: [],
          stocks: [
            {
              branchId: BRANCH_ID,
              variantId: VARIANT_ID,
              quantity: 40,
              lowStockThreshold: 5,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      },
    ],
  } as unknown as CheckoutCartRecord;
}

function savedAddressFixture() {
  return {
    id: '01K7Y7MWNCW7BNBBNTWAB9DYSH',
    receiverName: 'Nguyễn Văn A',
    receiverPhone: '0901234567',
    detail: 'Hẻm tổ 7',
    provinceCode: 92,
    province: 'Thành phố Cần Thơ',
    wardCode: 31135,
    ward: 'Phường Ninh Kiều',
    updatedAt: new Date(),
    latitude: null,
    longitude: null,
    ghnProvinceId: null,
    ghnDistrictId: null,
    ghnWardCode: null,
    ghnMappingVerifiedAt: null,
  };
}

function createService() {
  const findCart = jest.fn().mockResolvedValue(cartFixture());
  const findOwnedAddress = jest.fn().mockResolvedValue(savedAddressFixture());
  const repository = {
    findCart,
    findOwnedAddress,
  } as unknown as CheckoutRepository;
  const vietmap = {
    reverse: jest.fn(),
  };
  const service = new CheckoutService(
    repository,
    new StorefrontPriceService(),
    new CartValidationService(),
    new InternalShippingFeeService(),
    vietmap as never,
    { buildPaymentUrl: jest.fn() } as never,
    { getOrThrow: jest.fn() } as never,
  );
  return { service, findOwnedAddress, vietmap };
}

describe('CheckoutService internal shipping hotfix', () => {
  it('previews a saved address without Vietmap or GHN and fills recipient data', async () => {
    const { service, findOwnedAddress, vietmap } = createService();
    const result = await service.preview(actor, BRANCH_ID, {
      selectedCartItemIds: [CART_ITEM_ID],
      paymentMethod: 'COD',
      address: {
        source: 'SAVED_ADDRESS',
        customerAddressId: '01K7Y7MWNCW7BNBBNTWAB9DYSH',
      },
    });

    expect(findOwnedAddress).toHaveBeenCalledWith(
      actor.id,
      '01K7Y7MWNCW7BNBBNTWAB9DYSH',
    );
    expect(vietmap.reverse).not.toHaveBeenCalled();
    expect(result.shippingFee).toBe(15_000);
    expect(result.shippingFeeRule).toBe('SAME_PROVINCE');
    expect(result.shippingProviderCode).toBe('GHN');
    expect(result.shippingMethodCode).toBe('STANDARD');
    expect(result.totalAmount).toBe(135_000);
    expect(result.address).toEqual(
      expect.objectContaining({
        receiverName: 'Nguyễn Văn A',
        receiverPhone: '0901234567',
        formattedAddress: 'Hẻm tổ 7, Phường Ninh Kiều, Thành phố Cần Thơ',
      }),
    );
  });

  it('uses one two-level reverse for current location and returns provinceCode', async () => {
    const { service, vietmap } = createService();
    vietmap.reverse.mockResolvedValue({
      latitude: 10.0452,
      longitude: 105.7469,
      countryCode: 'VN',
      province: 'Thành phố Cần Thơ',
      district: null,
      ward: 'Phường Ninh Kiều',
      address: 'Hẻm tổ 7',
      displayAddress: 'Hẻm tổ 7, Phường Ninh Kiều, Thành phố Cần Thơ',
    });

    await expect(
      service.resolveCurrentLocation(actor, {
        latitude: 10.0452,
        longitude: 105.7469,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        province: 'Thành phố Cần Thơ',
        provinceCode: 92,
        ward: 'Phường Ninh Kiều',
      }),
    );
    expect(vietmap.reverse).toHaveBeenCalledTimes(1);
  });

  it('does not reverse again when previewing an applied current location', async () => {
    const { service, vietmap } = createService();
    const result = await service.preview(actor, BRANCH_ID, {
      selectedCartItemIds: [CART_ITEM_ID],
      paymentMethod: 'VNPAY',
      address: {
        source: 'CURRENT_LOCATION',
        receiverName: 'Nguyễn Văn A',
        receiverPhone: '0901234567',
        addressLine: 'Hẻm tổ 7',
        provinceName: 'Thành phố Cần Thơ',
        provinceCode: 92,
        wardName: 'Phường Ninh Kiều',
        latitude: 10.0452,
        longitude: 105.7469,
        locationProvider: 'VIETMAP',
      },
    });

    expect(vietmap.reverse).not.toHaveBeenCalled();
    expect(result.shippingFee).toBe(15_000);
    expect(result.totalAmount).toBe(135_000);
  });
});
