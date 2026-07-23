import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus, UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { CartService } from './cart.service';

const customer = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  type: UserType.CUSTOMER,
} as AuthenticatedUser;

describe('CartService', () => {
  const repository = {
    findBranch: jest.fn(),
    findCart: jest.fn(),
    syncBranch: jest.fn(),
    findVariant: jest.fn(),
    addItem: jest.fn(),
    findOwnedItem: jest.fn(),
    updateQuantity: jest.fn(),
    deleteItem: jest.fn(),
  };
  const mapper = { toResponse: jest.fn((value) => value) };
  const prices = { resolve: jest.fn(() => ({ current: 79000 })) };
  const service = new CartService(
    repository as never,
    mapper as never,
    prices as never,
  );
  const branch = {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAA',
    isActive: true,
  };
  const variant = {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAB',
    isActive: true,
    product: { status: ProductStatus.ACTIVE },
    stocks: [{ quantity: 3 }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findBranch.mockResolvedValue(branch);
    repository.findVariant.mockResolvedValue(variant);
    repository.addItem.mockResolvedValue('ok');
    repository.findCart.mockResolvedValue({ id: 'cart' });
  });

  it('rejects non-customer actors', async () => {
    await expect(
      service.get({ ...customer, type: UserType.SYSTEM }, branch.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an active branch', async () => {
    await expect(service.get(customer, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    repository.findBranch.mockResolvedValue({ ...branch, isActive: false });
    await expect(service.get(customer, branch.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('syncs a changed branch without deleting items', async () => {
    repository.findCart.mockResolvedValue({ id: 'cart', branchId: 'old' });
    repository.syncBranch.mockResolvedValue({
      id: 'cart',
      branchId: branch.id,
    });

    await service.get(customer, branch.id);

    expect(repository.syncBranch).toHaveBeenCalledWith(customer.id, branch.id);
    expect(repository.deleteItem).not.toHaveBeenCalled();
  });

  it('adds the exact variant and backend-resolved price', async () => {
    await service.add(customer, branch.id, {
      productVariantId: variant.id,
      quantity: 2,
    });

    expect(repository.addItem).toHaveBeenCalledWith(
      customer.id,
      branch.id,
      variant.id,
      2,
      3,
      79000,
    );
  });

  it('rejects adding beyond current stock', async () => {
    repository.addItem.mockResolvedValue('quantity-exceeded');
    await expect(
      service.add(customer, branch.id, {
        productVariantId: variant.id,
        quantity: 4,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 for an item owned by another customer', async () => {
    repository.findOwnedItem.mockResolvedValue(null);
    await expect(
      service.update(customer, branch.id, { quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes an invalid item without touching stock', async () => {
    repository.deleteItem.mockResolvedValue(true);
    await service.remove(customer, branch.id);
    expect(repository.deleteItem).toHaveBeenCalledWith(customer.id, branch.id);
    expect(repository.updateQuantity).not.toHaveBeenCalled();
  });
});
