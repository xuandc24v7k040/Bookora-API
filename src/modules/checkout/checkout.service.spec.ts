import { ProductStatus, UserType } from '@/generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { CartValidationService } from '@/modules/cart/cart-validation.service';
import { InternalShippingFeeService } from '@/modules/shipping/internal-shipping-fee.service';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import {
  CheckoutRepository,
  type CheckoutCartRecord,
} from './checkout.repository';
import { CheckoutService } from './checkout.service';
import { CheckoutLocationProofService } from './checkout-location-proof.service';

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

function cartFixture(
  province: string | null = 'Hậu Giang',
): CheckoutCartRecord {
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
      province,
      ward: 'Phường Vị Tân',
      latitude: null,
      longitude: null,
      isActive: true,
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
          weightGram: 350,
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
  };
}

function createService(branchProvince: string | null = 'Hậu Giang') {
  const findCart = jest.fn().mockResolvedValue(cartFixture(branchProvince));
  const findOwnedAddress = jest.fn().mockResolvedValue(savedAddressFixture());
  const transaction = jest.fn();
  const orderFindFirst = jest.fn().mockResolvedValue(null);
  const repository = {
    findCart,
    findOwnedAddress,
    transaction,
    client: { order: { findFirst: orderFindFirst } },
  } as unknown as CheckoutRepository;
  const vietmap = {
    reverse: jest.fn(),
  };
  const config = new ConfigService({
    shipping: {
      locationProof: {
        secret: 'checkout-location-proof-unit-test-secret-32-chars',
        ttlSeconds: 600,
      },
    },
    payment: { vnpay: { expireMinutes: 15 } },
  });
  const locationProof = new CheckoutLocationProofService(config);
  const service = new CheckoutService(
    repository,
    new StorefrontPriceService(),
    new CartValidationService(),
    new InternalShippingFeeService(),
    locationProof,
    vietmap as never,
    { buildPaymentUrl: jest.fn() } as never,
    config,
  );
  return { service, findOwnedAddress, vietmap, locationProof, transaction };
}

describe('CheckoutService internal shipping hotfix', () => {
  it('previews a saved address without reverse geocoding and fills recipient data', async () => {
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
    expect(result.totalProductWeightGram).toBe(350);
    expect(result.shippingFeeRule).toBe('SAME_PROVINCE');
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

  it('keeps customer note outside the preview fingerprint', async () => {
    const { service } = createService();
    const input = {
      selectedCartItemIds: [CART_ITEM_ID],
      paymentMethod: 'COD' as const,
      address: {
        source: 'SAVED_ADDRESS' as const,
        customerAddressId: '01K7Y7MWNCW7BNBBNTWAB9DYSH',
      },
    };

    const first = await service.preview(actor, BRANCH_ID, {
      ...input,
      note: 'Giao giờ hành chính',
    });
    const second = await service.preview(actor, BRANCH_ID, {
      ...input,
      note: 'Gọi trước khi giao',
    });

    expect(second.previewReference).toBe(first.previewReference);
    expect(first.note).toBe('Giao giờ hành chính');
    expect(second.note).toBe('Gọi trước khi giao');
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
    const { service, vietmap, locationProof } = createService();
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
        locationProof: locationProof.issue({
          provinceCode: 92,
          provinceName: 'can tho',
          wardName: 'phuong ninh kieu',
          latitude: 10.0452,
          longitude: 105.7469,
        }),
      },
    });

    expect(vietmap.reverse).not.toHaveBeenCalled();
    expect(result.shippingFee).toBe(15_000);
    expect(result.totalAmount).toBe(135_000);
  });

  it('charges 50,000 for a valid Hà Nội to current-location Cần Thơ proof', async () => {
    const { service, locationProof } = createService('Thành phố Hà Nội');
    const result = await service.preview(actor, BRANCH_ID, {
      selectedCartItemIds: [CART_ITEM_ID],
      paymentMethod: 'COD',
      address: currentLocationAddress(locationProof),
    });

    expect(result.shippingFee).toBe(50_000);
    expect(result.shippingFeeRule).toBe('FAR_REGION');
    expect(result.totalAmount).toBe(170_000);
  });

  it.each([
    ['provinceCode', { provinceCode: 1 }],
    ['provinceName', { provinceName: 'Hà Nội' }],
    ['latitude', { latitude: 21.0285 }],
    ['longitude', { longitude: 105.8542 }],
  ])(
    'rejects a current-location payload with tampered %s',
    async (_field, patch) => {
      const { service, locationProof } = createService('Hà Nội');
      await expect(
        service.preview(actor, BRANCH_ID, {
          selectedCartItemIds: [CART_ITEM_ID],
          paymentMethod: 'COD',
          address: { ...currentLocationAddress(locationProof), ...patch },
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CHECKOUT_LOCATION_PROOF_MISMATCH',
        }),
      });
    },
  );

  it('rejects a mutated proof before a preview hash can be issued', async () => {
    const { service, locationProof } = createService('Hà Nội');
    const address = currentLocationAddress(locationProof);
    const token = address.locationProof;
    address.locationProof = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    await expect(
      service.preview(actor, BRANCH_ID, {
        selectedCartItemIds: [CART_ITEM_ID],
        paymentMethod: 'COD',
        address,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHECKOUT_LOCATION_PROOF_INVALID',
      }),
    });
  });

  it.each(['COD', 'VNPAY'] as const)(
    'verifies proof before creating a %s order or payment',
    async (paymentMethod) => {
      const { service, locationProof, transaction } = createService('Hà Nội');
      const address = currentLocationAddress(locationProof);
      address.provinceCode = 1;
      const base = {
        selectedCartItemIds: [CART_ITEM_ID],
        address,
        previewReference: 'a'.repeat(64),
      };
      const place =
        paymentMethod === 'COD'
          ? service.placeCod(actor, BRANCH_ID, {
              ...base,
              paymentMethod,
              idempotencyKey: 'proof-test-cod',
            })
          : service.placeVnpay(
              actor,
              BRANCH_ID,
              {
                ...base,
                paymentMethod,
                idempotencyKey: 'proof-test-vnpay',
              },
              '127.0.0.1',
            );

      await expect(place).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CHECKOUT_LOCATION_PROOF_MISMATCH',
        }),
      });
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([null, '', 'Tỉnh không tồn tại'])(
    'fails closed when branch province is %p',
    async (province) => {
      const { service } = createService(province);
      await expect(
        service.preview(actor, BRANCH_ID, {
          selectedCartItemIds: [CART_ITEM_ID],
          paymentMethod: 'COD',
          address: {
            source: 'SAVED_ADDRESS',
            customerAddressId: '01K7Y7MWNCW7BNBBNTWAB9DYSH',
          },
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CHECKOUT_SHIPPING_PROVINCE_REQUIRED',
        }),
      });
    },
  );
});

function currentLocationAddress(locationProof: CheckoutLocationProofService) {
  return {
    source: 'CURRENT_LOCATION' as const,
    receiverName: 'Nguyễn Văn A',
    receiverPhone: '0901234567',
    addressLine: 'Hẻm tổ 7',
    provinceName: 'Thành phố Cần Thơ',
    provinceCode: 92,
    wardName: 'Phường Ninh Kiều',
    latitude: 10.0452,
    longitude: 105.7469,
    locationProvider: 'VIETMAP' as const,
    locationProof: locationProof.issue({
      provinceCode: 92,
      provinceName: 'can tho',
      wardName: 'phuong ninh kieu',
      latitude: 10.0452,
      longitude: 105.7469,
    }),
  };
}
