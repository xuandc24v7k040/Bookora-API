import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { ReviewsRepository } from './reviews.repository';
import { ReviewsService } from './reviews.service';

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

describe('ReviewsService eligibility', () => {
  const tx = {
    order: { findUnique: jest.fn() },
    product: { findUnique: jest.fn() },
    review: { create: jest.fn() },
  };
  const repository = {
    transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    findMine: jest.fn(),
  };
  const service = new ReviewsService(
    repository as unknown as ReviewsRepository,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects an order owned by another customer', async () => {
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: 'customer-2',
      branchId: 'branch-1',
      status: OrderStatus.COMPLETED,
      items: [{ productId: 'product-1' }],
    });
    await expect(
      service.create(actor, {
        orderId: 'order-1',
        productId: 'product-1',
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects SHIPPING even when the product belongs to the order', async () => {
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: actor.id,
      branchId: 'branch-1',
      status: OrderStatus.SHIPPING,
      items: [{ productId: 'product-1' }],
    });
    await expect(
      service.create(actor, {
        orderId: 'order-1',
        productId: 'product-1',
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.review.create).not.toHaveBeenCalled();
  });

  it('rejects a product that is not in the completed order', async () => {
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      userId: actor.id,
      branchId: 'branch-1',
      status: OrderStatus.COMPLETED,
      items: [{ productId: 'product-2' }],
    });
    await expect(
      service.create(actor, {
        orderId: 'order-1',
        productId: 'product-1',
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.review.create).not.toHaveBeenCalled();
  });
});

describe('ReviewsService public review contract', () => {
  const repository = {
    findPublicProduct: jest.fn(),
    listPublic: jest.fn(),
  };
  const service = new ReviewsService(
    repository as unknown as ReviewsRepository,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns global rating distribution while paginating the filtered list', async () => {
    repository.findPublicProduct.mockResolvedValue({ id: 'product-1' });
    repository.listPublic.mockResolvedValue({
      items: [
        {
          id: 'review-1',
          rating: 5,
          content: null,
          user: { fullName: 'Nguyễn An', avatarUrl: null },
          createdAt: new Date('2026-07-27T09:00:00.000Z'),
          updatedAt: new Date('2026-07-27T09:00:00.000Z'),
        },
      ],
      totalItems: 1,
      pageSize: 4,
      aggregate: { _count: { _all: 7 }, _avg: { rating: 4.86 } },
      distribution: [
        { rating: 5, _count: { _all: 6 } },
        { rating: 4, _count: { _all: 1 } },
      ],
    });

    const result = await service.publicList('product-1', {
      page: 1,
      limit: 4,
      rating: 5,
      verifiedPurchase: true,
    });

    expect(repository.listPublic).toHaveBeenCalledWith('product-1', {
      page: 1,
      limit: 4,
      rating: 5,
      verifiedPurchase: true,
    });
    expect(result.totalItems).toBe(1);
    expect(result.reviewCount).toBe(7);
    expect(result.ratingDistribution).toEqual([
      { rating: 5, count: 6 },
      { rating: 4, count: 1 },
      { rating: 3, count: 0 },
      { rating: 2, count: 0 },
      { rating: 1, count: 0 },
    ]);
    expect(result.items[0]?.content).toBeNull();
  });
});

describe('ReviewsService order filter ownership', () => {
  const repository = {
    findOwnedOrder: jest.fn(),
    listMine: jest.fn(),
    listPending: jest.fn(),
  };
  const service = new ReviewsService(
    repository as unknown as ReviewsRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.listMine.mockResolvedValue({
      items: [],
      totalItems: 0,
      page: 1,
      limit: 10,
    });
    repository.listPending.mockResolvedValue({
      items: [],
      totalItems: 0,
      page: 1,
      limit: 10,
    });
  });

  it('passes an owned orderId to the written review query', async () => {
    repository.findOwnedOrder.mockResolvedValue({ id: 'order-1' });

    await service.mine(actor, { orderId: 'order-1', page: 1, limit: 10 });

    expect(repository.findOwnedOrder).toHaveBeenCalledWith(actor.id, 'order-1');
    expect(repository.listMine).toHaveBeenCalledWith(actor.id, {
      orderId: 'order-1',
      page: 1,
      limit: 10,
    });
  });

  it('rejects a pending filter for an order outside the customer account', async () => {
    repository.findOwnedOrder.mockResolvedValue(null);

    await expect(
      service.pending(actor, { orderId: 'order-2', page: 1, limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.listPending).not.toHaveBeenCalled();
  });
});
