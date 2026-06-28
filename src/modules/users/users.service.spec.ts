import { ForbiddenException } from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UsersService } from './users.service';

describe('UsersService authorization boundary', () => {
  const repository = {
    createCustomerForAuth: jest.fn(),
    count: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    disableWithSessions: jest.fn(),
  };
  const systemProtectionPolicy = {
    assertCanRemoveSuperAdmin: jest.fn(),
  };
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      repository as never,
      systemProtectionPolicy as never,
    );
  });

  it('creates a generic user as CUSTOMER through the CUSTOMER transaction', async () => {
    repository.createCustomerForAuth.mockResolvedValue({ id: 'user-id' });
    repository.findById.mockResolvedValue({
      id: 'user-id',
      type: UserType.CUSTOMER,
    });

    await expect(
      service.create(superAdmin(), {
        fullName: 'Customer',
        email: 'CUSTOMER@example.com',
      }),
    ).resolves.toMatchObject({ type: UserType.CUSTOMER });
    const createInput = repository.createCustomerForAuth.mock.calls[0][0];
    expect(createInput).toMatchObject({ email: 'customer@example.com' });
    expect(createInput).not.toHaveProperty('type');
  });

  it('rejects generic creation by a non-Super Admin even if called outside guards', async () => {
    await expect(
      service.create(branchActor(), {
        fullName: 'Customer',
        email: 'customer@example.com',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.createCustomerForAuth).not.toHaveBeenCalled();
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it.each([
    ['list', () => service.findAll(branchActor(), {})],
    ['detail', () => service.findOne(branchActor(), 'super-admin-id')],
    ['update', () => service.update(branchActor(), 'super-admin-id', {})],
    ['delete', () => service.remove(branchActor(), 'super-admin-id')],
  ])(
    'rejects generic %s by a non-Super Admin before target lookup',
    async (_caseName, action) => {
      await expect(action()).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.findMany).not.toHaveBeenCalled();
      expect(repository.count).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.disableWithSessions).not.toHaveBeenCalled();
    },
  );

  it('allows Super Admin to list generic users', async () => {
    repository.findMany.mockResolvedValue([{ id: 'user-id' }]);
    repository.count.mockResolvedValue(1);

    await expect(service.findAll(superAdmin(), {})).resolves.toMatchObject({
      data: [{ id: 'user-id' }],
      meta: expect.objectContaining({ total: 1 }),
    });

    expect(repository.findMany).toHaveBeenCalled();
    expect(repository.count).toHaveBeenCalled();
  });

  it('runs last Super Admin protection in the disable transaction', async () => {
    const tx = { user: {}, role: {} };
    repository.findById.mockResolvedValue({ id: 'user-id' });
    repository.disableWithSessions.mockImplementation(
      async (
        _id: string,
        assertAllowed: (client: typeof tx) => Promise<void>,
      ) => {
        await assertAllowed(tx);
        return { id: 'user-id', isActive: false };
      },
    );

    await service.remove(superAdmin(), 'user-id');

    expect(
      systemProtectionPolicy.assertCanRemoveSuperAdmin,
    ).toHaveBeenCalledWith('user-id', tx);
  });
});

function superAdmin(): AuthenticatedUser {
  return actor({
    type: UserType.SYSTEM,
    isSuperAdmin: true,
    maxRoleLevel: 100,
  });
}

function branchActor(): AuthenticatedUser {
  return actor({ maxRoleLevel: 70 });
}

function actor(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    id: 'actor-id',
    email: 'actor@example.com',
    fullName: 'Actor',
    type: UserType.BRANCH,
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
    sessionId: 'session-id',
    ...overrides,
  };
}
