import { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { StorefrontPriceService } from '@/modules/storefront-catalog/storefront-price.service';
import type { WishlistsRepository } from './wishlists.repository';
import { WishlistsService } from './wishlists.service';

const actor: AuthenticatedUser = {
  id: 'customer-1',
  email: 'customer@bookora.test',
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
  sessionId: 'session-1',
};

describe('WishlistsService', () => {
  const repository = {
    findPublicProduct: jest.fn(),
    upsert: jest.fn(),
    remove: jest.fn(),
    status: jest.fn(),
  };
  const service = new WishlistsService(
    repository as unknown as WishlistsRepository,
    new StorefrontPriceService(),
  );

  beforeEach(() => jest.resetAllMocks());

  it('keeps add idempotent through repository upsert', async () => {
    repository.findPublicProduct.mockResolvedValue({ id: 'product-1' });
    repository.upsert.mockResolvedValue(undefined);

    await expect(service.add(actor, 'product-1')).resolves.toEqual({
      productId: 'product-1',
      isWishlisted: true,
    });
    await expect(service.add(actor, 'product-1')).resolves.toEqual({
      productId: 'product-1',
      isWishlisted: true,
    });
    expect(repository.upsert).toHaveBeenCalledTimes(2);
  });

  it('deduplicates product ids for batch status', async () => {
    repository.status.mockResolvedValue([{ productId: 'product-1' }]);
    await expect(
      service.status(actor, ['product-1', 'product-1']),
    ).resolves.toEqual({ wishlistedProductIds: ['product-1'] });
    expect(repository.status).toHaveBeenCalledWith('customer-1', ['product-1']);
  });
});
