import { ForbiddenException } from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { UserActivationRequiresActiveBranchError } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService authorization boundary', () => {
  const repository = {
    createCustomerForAuth: jest.fn(),
    count: jest.fn(),
    findById: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    activate: jest.fn(),
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
    ['activate', () => service.activate(branchActor(), 'super-admin-id')],
    ['delete', () => service.remove(branchActor(), 'super-admin-id')],
  ])(
    'rejects generic %s by a non-Super Admin before target lookup',
    async (_caseName, action) => {
      await expect(action()).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.findMany).not.toHaveBeenCalled();
      expect(repository.count).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.activate).not.toHaveBeenCalled();
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

  it('composes search, type and active filters with deterministic ordering', async () => {
    repository.findMany.mockResolvedValue([]);
    repository.count.mockResolvedValue(0);

    await service.findAll(superAdmin(), {
      search: ' Customer ',
      type: UserType.CUSTOMER,
      isActive: false,
    });

    expect(repository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { email: { contains: 'Customer', mode: 'insensitive' } },
                { fullName: { contains: 'Customer', mode: 'insensitive' } },
              ],
            },
            { type: UserType.CUSTOMER },
            { isActive: false },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(repository.count).toHaveBeenCalledWith({
      AND: expect.arrayContaining([
        { type: UserType.CUSTOMER },
        { isActive: false },
      ]),
    });
  });

  it('normalizes update email and persists birthday as a UTC date', async () => {
    repository.findById.mockResolvedValue({ id: 'user-id', birthday: null });
    repository.update.mockResolvedValue({
      id: 'user-id',
      birthday: new Date('1995-08-17T00:00:00.000Z'),
    });

    await expect(
      service.update(superAdmin(), 'user-id', {
        email: 'USER@EXAMPLE.COM',
        birthday: '1995-08-17',
      }),
    ).resolves.toMatchObject({ birthday: '1995-08-17' });

    expect(repository.update).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({
        email: 'user@example.com',
        birthday: new Date('1995-08-17T00:00:00.000Z'),
      }),
    );
  });

  it('returns a stable activation error when a BRANCH user has no valid assignment', async () => {
    repository.activate.mockRejectedValue(
      new UserActivationRequiresActiveBranchError(),
    );

    await expect(
      service.activate(superAdmin(), 'user-id'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'USER_ACTIVATION_REQUIRES_ACTIVE_BRANCH',
      }),
    });
  });

  it('reactivates a user without touching sessions', async () => {
    repository.activate.mockResolvedValue({
      id: 'user-id',
      isActive: true,
      birthday: null,
    });

    await expect(
      service.activate(superAdmin(), 'user-id'),
    ).resolves.toMatchObject({
      isActive: true,
    });
    expect(repository.disableWithSessions).not.toHaveBeenCalled();
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
    phone: null,
    gender: null,
    birthday: null,
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
