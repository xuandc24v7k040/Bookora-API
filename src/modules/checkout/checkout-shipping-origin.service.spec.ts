import {
  BadGatewayException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CheckoutHybridAddress } from '@/modules/integrations/vietmap/vietmap.service';
import type { CheckoutCartRecord } from './checkout.repository';
import { CheckoutShippingOriginService } from './checkout-shipping-origin.service';

const BRANCH_ID = '01KW40RP7VF4TCF39EDHH73VAS';

function branchFixture(
  overrides: Partial<CheckoutCartRecord['branch']> = {},
): CheckoutCartRecord['branch'] {
  return {
    id: BRANCH_ID,
    code: 'can-tho',
    name: 'Chi nhánh Cần Thơ',
    phone: '02923888888',
    address: '12 đường 3 Tháng 2',
    province: 'Thành phố Cần Thơ',
    ward: 'Phường Ninh Kiều',
    latitude: null,
    longitude: null,
    ghnProvinceId: null,
    ghnDistrictId: null,
    ghnWardCode: null,
    ghnMappingVerifiedAt: null,
    ghnShopId: null,
    isActive: true,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    updatedAt: new Date('2026-07-24T00:00:00.000Z'),
    ...overrides,
  };
}

function hybridFixture(
  overrides: Partial<{
    latitude: number;
    longitude: number;
    currentProvince: string;
    currentWard: string;
    legacyProvince: string;
    legacyDistrict: string;
    legacyWard: string;
    countryCode: string | null;
  }> = {},
): CheckoutHybridAddress {
  return {
    current: {
      formattedAddress:
        '12 đường 3 Tháng 2, Phường Ninh Kiều, Thành phố Cần Thơ',
      addressLine: '12 đường 3 Tháng 2',
      provinceName: overrides.currentProvince ?? 'Thành phố Cần Thơ',
      provinceCode: 92,
      wardName: overrides.currentWard ?? 'Phường Ninh Kiều',
      wardCode: 31135,
      latitude: overrides.latitude ?? 10.0452,
      longitude: overrides.longitude ?? 105.7469,
    },
    legacy: {
      provinceName: overrides.legacyProvince ?? 'Thành phố Cần Thơ',
      districtName: overrides.legacyDistrict ?? 'Quận Ninh Kiều',
      wardName: overrides.legacyWard ?? 'Phường Xuân Khánh',
    },
    provider: 'VIETMAP',
    placeId: 'vm:branch',
    countryCode:
      overrides.countryCode === undefined ? 'VN' : overrides.countryCode,
  };
}

function createService() {
  const repository = {
    updateBranchResolution: jest.fn().mockResolvedValue(undefined),
  };
  const vietmap = {
    reverseHybridForCheckoutShipping: jest.fn(),
    geocodeHybridForCheckoutShipping: jest.fn(),
  };
  const verifiedAt = new Date('2026-07-24T01:00:00.000Z');
  const ghn = {
    resolveCheckoutAddressExact: jest.fn().mockResolvedValue({
      provinceId: 220,
      provinceName: 'Cần Thơ',
      districtId: 1444,
      districtName: 'Ninh Kiều',
      wardCode: '13010',
      wardName: 'Xuân Khánh',
      verifiedAt,
    }),
  };
  const service = new CheckoutShippingOriginService(
    repository as never,
    vietmap as never,
    ghn as never,
  );
  return { service, repository, vietmap, ghn, verifiedAt };
}

describe('CheckoutShippingOriginService', () => {
  it('uses valid persisted metadata without Vietmap or GHN master-data calls', async () => {
    const { service, repository, vietmap, ghn } = createService();
    const verifiedAt = new Date('2026-07-24T00:00:00.000Z');
    const branch = branchFixture({
      ghnProvinceId: 220,
      ghnDistrictId: 1444,
      ghnWardCode: '13010',
      ghnMappingVerifiedAt: verifiedAt,
    });

    await expect(
      service.resolveCheckoutShippingOrigin(branch),
    ).resolves.toEqual({
      branchId: BRANCH_ID,
      ghnProvinceId: 220,
      ghnDistrictId: 1444,
      ghnWardCode: '13010',
      verifiedAt,
      source: 'PERSISTED_METADATA',
    });
    expect(vietmap.reverseHybridForCheckoutShipping).not.toHaveBeenCalled();
    expect(vietmap.geocodeHybridForCheckoutShipping).not.toHaveBeenCalled();
    expect(ghn.resolveCheckoutAddressExact).not.toHaveBeenCalled();
    expect(repository.updateBranchResolution).not.toHaveBeenCalled();
  });

  it('reverse-resolves coordinates once, maps legacy hierarchy and persists all fields', async () => {
    const { service, repository, vietmap, ghn, verifiedAt } = createService();
    const branch = branchFixture({
      latitude: 10.0452 as never,
      longitude: 105.7469 as never,
    });
    vietmap.reverseHybridForCheckoutShipping.mockResolvedValue(hybridFixture());

    const [first, second] = await Promise.all([
      service.resolveCheckoutShippingOrigin(branch),
      service.resolveCheckoutShippingOrigin(branch),
    ]);

    expect(first).toMatchObject({
      branchId: BRANCH_ID,
      ghnDistrictId: 1444,
      ghnWardCode: '13010',
      source: 'VIETMAP_REVERSE_V4',
    });
    expect(second).toEqual(first);
    expect(vietmap.reverseHybridForCheckoutShipping).toHaveBeenCalledTimes(1);
    expect(vietmap.reverseHybridForCheckoutShipping).toHaveBeenCalledWith(
      10.0452,
      105.7469,
    );
    expect(vietmap.geocodeHybridForCheckoutShipping).not.toHaveBeenCalled();
    expect(ghn.resolveCheckoutAddressExact).toHaveBeenCalledWith(
      'Thành phố Cần Thơ',
      'Quận Ninh Kiều',
      'Phường Xuân Khánh',
    );
    expect(repository.updateBranchResolution).toHaveBeenCalledWith(BRANCH_ID, {
      latitude: 10.0452,
      longitude: 105.7469,
      ghnProvinceId: 220,
      ghnDistrictId: 1444,
      ghnWardCode: '13010',
      ghnMappingVerifiedAt: verifiedAt,
    });
  });

  it('geocodes the deterministic full Branch address and reverse-resolves the unique candidate', async () => {
    const { service, repository, vietmap } = createService();
    const candidate = hybridFixture();
    vietmap.geocodeHybridForCheckoutShipping.mockResolvedValue([candidate]);
    vietmap.reverseHybridForCheckoutShipping.mockResolvedValue(candidate);

    await expect(
      service.resolveCheckoutShippingOrigin(branchFixture()),
    ).resolves.toMatchObject({
      source: 'VIETMAP_GEOCODE_V4',
      ghnDistrictId: 1444,
      ghnWardCode: '13010',
    });

    expect(vietmap.geocodeHybridForCheckoutShipping).toHaveBeenCalledWith(
      '12 đường 3 Tháng 2, Phường Ninh Kiều, Thành phố Cần Thơ, Việt Nam',
    );
    expect(vietmap.reverseHybridForCheckoutShipping).toHaveBeenCalledWith(
      10.0452,
      105.7469,
    );
    expect(repository.updateBranchResolution).toHaveBeenCalledTimes(1);
  });

  it('returns origin not-found when no deterministic geocode candidate remains', async () => {
    const { service, vietmap, ghn } = createService();
    vietmap.geocodeHybridForCheckoutShipping.mockResolvedValue([
      hybridFixture({ currentWard: 'Phường Cái Khế' }),
    ]);

    await expect(
      service.resolveCheckoutShippingOrigin(branchFixture()),
    ).rejects.toMatchObject({
      response: { code: 'CHECKOUT_ORIGIN_GEOCODE_NOT_FOUND' },
    });
    expect(vietmap.reverseHybridForCheckoutShipping).not.toHaveBeenCalled();
    expect(ghn.resolveCheckoutAddressExact).not.toHaveBeenCalled();
  });

  it('never selects the first candidate when multiple deterministic matches remain', async () => {
    const { service, vietmap, ghn } = createService();
    vietmap.geocodeHybridForCheckoutShipping.mockResolvedValue([
      hybridFixture(),
      hybridFixture({ latitude: 10.046, longitude: 105.747 }),
    ]);

    await expect(
      service.resolveCheckoutShippingOrigin(branchFixture()),
    ).rejects.toMatchObject({
      response: { code: 'CHECKOUT_ORIGIN_GEOCODE_AMBIGUOUS' },
    });
    expect(vietmap.reverseHybridForCheckoutShipping).not.toHaveBeenCalled();
    expect(ghn.resolveCheckoutAddressExact).not.toHaveBeenCalled();
  });

  it('returns origin incomplete when hybrid data_old lacks a district', async () => {
    const { service, vietmap, ghn } = createService();
    vietmap.reverseHybridForCheckoutShipping.mockResolvedValue(
      hybridFixture({ legacyDistrict: '' }),
    );

    await expect(
      service.resolveCheckoutShippingOrigin(
        branchFixture({
          latitude: 10.0452 as never,
          longitude: 105.7469 as never,
        }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'CHECKOUT_ORIGIN_ADDRESS_INCOMPLETE' },
    });
    expect(ghn.resolveCheckoutAddressExact).not.toHaveBeenCalled();
  });

  it.each([
    ['GHN_ADDRESS_MAPPING_INVALID', 'CHECKOUT_ORIGIN_GHN_MAPPING_INVALID'],
    ['GHN_ADDRESS_UNSUPPORTED', 'GHN_ORIGIN_ADDRESS_UNSUPPORTED'],
  ])(
    'maps %s to the origin-specific error %s',
    async (sourceCode, targetCode) => {
      const { service, vietmap, ghn } = createService();
      vietmap.reverseHybridForCheckoutShipping.mockResolvedValue(
        hybridFixture(),
      );
      ghn.resolveCheckoutAddressExact.mockRejectedValue(
        new UnprocessableEntityException({ code: sourceCode }),
      );

      await expect(
        service.resolveCheckoutShippingOrigin(
          branchFixture({
            latitude: 10.0452 as never,
            longitude: 105.7469 as never,
          }),
        ),
      ).rejects.toMatchObject({
        response: { code: targetCode },
      });
    },
  );

  it('does not cache provider failures as successful origin resolutions', async () => {
    const { service, vietmap } = createService();
    const branch = branchFixture({
      latitude: 10.0452 as never,
      longitude: 105.7469 as never,
    });
    vietmap.reverseHybridForCheckoutShipping
      .mockRejectedValueOnce(
        new BadGatewayException({ code: 'ADDRESS_PROVIDER_UNAVAILABLE' }),
      )
      .mockResolvedValueOnce(hybridFixture());

    await expect(
      service.resolveCheckoutShippingOrigin(branch),
    ).rejects.toMatchObject({
      response: { code: 'ADDRESS_PROVIDER_UNAVAILABLE' },
    });
    await expect(
      service.resolveCheckoutShippingOrigin(branch),
    ).resolves.toMatchObject({ source: 'VIETMAP_REVERSE_V4' });
    expect(vietmap.reverseHybridForCheckoutShipping).toHaveBeenCalledTimes(2);
  });
});
