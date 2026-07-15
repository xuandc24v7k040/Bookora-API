import { AuthProvider, Prisma, UserType } from '@/generated/prisma/client';
import {
  CustomerRoleConfigurationError,
  UsersRepository,
} from './users.repository';

describe('UsersRepository customer transaction', () => {
  const tx = {
    authSession: { updateMany: jest.fn() },
    role: { findFirst: jest.fn() },
    user: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    userRole: { create: jest.fn() },
    userBranch: { count: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };

  let repository: UsersRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new UsersRepository(prisma as never);
  });

  it.each([
    ['local register', AuthProvider.LOCAL, 'password-hash', undefined],
    ['Google register', AuthProvider.GOOGLE, undefined, 'google-id'],
  ])(
    'creates CUSTOMER and UserRole atomically for %s',
    async (_caseName, provider, passwordHash, googleId) => {
      tx.role.findFirst.mockResolvedValue({ id: 'customer-role-id' });
      tx.user.create.mockResolvedValue({
        id: 'user-id',
        email: 'user@example.com',
        type: UserType.CUSTOMER,
      });

      await repository.createCustomerForAuth({
        email: 'user@example.com',
        fullName: 'User',
        provider,
        passwordHash,
        googleId,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.role.findFirst).toHaveBeenCalledWith({
        where: {
          code: 'CUSTOMER',
          type: UserType.CUSTOMER,
          isSystem: true,
          isActive: true,
        },
        select: { id: true },
      });
      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'user@example.com',
          type: UserType.CUSTOMER,
          provider,
        }),
      });
      expect(tx.userRole.create).toHaveBeenCalledWith({
        data: { userId: 'user-id', roleId: 'customer-role-id' },
      });
    },
  );

  it('aborts before user creation when CUSTOMER role is missing or inactive', async () => {
    tx.role.findFirst.mockResolvedValue(null);

    await expect(
      repository.createCustomerForAuth({
        email: 'user@example.com',
        fullName: 'User',
        provider: AuthProvider.LOCAL,
        passwordHash: 'password-hash',
      }),
    ).rejects.toBeInstanceOf(CustomerRoleConfigurationError);

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.userRole.create).not.toHaveBeenCalled();
  });

  it('disables a user and revokes sessions in a Serializable transaction', async () => {
    const assertAllowed = jest.fn();
    tx.user.update.mockResolvedValue({ id: 'user-id', isActive: false });

    await repository.disableWithSessions('user-id', assertAllowed);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(assertAllowed).toHaveBeenCalledWith(tx);
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-id' },
        data: { isActive: false },
      }),
    );
  });

  it('retries a Serializable disable transaction on Prisma write conflict', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: 'test',
    });
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      );
    tx.user.update.mockResolvedValue({ id: 'user-id', isActive: false });

    await repository.disableWithSessions('user-id', jest.fn());

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('reactivates CUSTOMER without restoring sessions', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 'user-id',
      type: UserType.CUSTOMER,
      isActive: false,
    });
    tx.user.update.mockResolvedValue({ id: 'user-id', isActive: true });

    await repository.activate('user-id');

    expect(tx.userBranch.count).not.toHaveBeenCalled();
    expect(tx.authSession.updateMany).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
  });

  it('requires an active assignment and exactly one active primary for BRANCH activation', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 'user-id',
      type: UserType.BRANCH,
      isActive: false,
    });
    tx.userBranch.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(repository.activate('user-id')).rejects.toThrow(
      'active assignment',
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('reactivates BRANCH with a valid active primary assignment', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 'user-id',
      type: UserType.BRANCH,
      isActive: false,
    });
    tx.userBranch.count.mockResolvedValue(1);
    tx.user.update.mockResolvedValue({ id: 'user-id', isActive: true });

    await repository.activate('user-id');

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
  });
});
