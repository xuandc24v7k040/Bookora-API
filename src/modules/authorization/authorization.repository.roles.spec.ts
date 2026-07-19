import { UserType } from '@/generated/prisma/client';
import { AuthorizationRepository } from './authorization.repository';
import { RoleSortField } from './dto';

describe('AuthorizationRepository role catalog', () => {
  const role = {
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const repository = new AuthorizationRepository({ role } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    role.findMany.mockResolvedValue([]);
    role.count.mockResolvedValue(0);
  });

  it('composes search and filters into the same where for data and count', async () => {
    await repository.listRoles({
      skip: 20,
      take: 10,
      search: 'sale',
      type: UserType.BRANCH,
      isActive: false,
      isSystem: false,
      guardName: 'web',
      levelFrom: 10,
      levelTo: 20,
      createdFrom: new Date('2026-06-30T17:00:00.000Z'),
      createdTo: new Date('2026-07-02T17:00:00.000Z'),
      sortBy: RoleSortField.NAME,
      sortOrder: 'asc',
    });

    const findManyInput = role.findMany.mock.calls[0][0];
    expect(findManyInput).toMatchObject({
      skip: 20,
      take: 10,
      where: {
        type: UserType.BRANCH,
        isActive: false,
        isSystem: false,
        guardName: 'web',
        level: { gte: 10, lte: 20 },
        createdAt: {
          gte: new Date('2026-06-30T17:00:00.000Z'),
          lt: new Date('2026-07-02T17:00:00.000Z'),
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    expect(findManyInput.where.OR).toHaveLength(3);
    expect(role.count).toHaveBeenCalledWith({ where: findManyInput.where });
  });

  it.each(Object.values(RoleSortField))(
    'uses deterministic ordering for %s',
    async (sortBy) => {
      await repository.listRoles({
        skip: 0,
        take: 10,
        sortBy,
        sortOrder: 'desc',
      });

      expect(role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ [sortBy]: 'desc' }, { id: 'asc' }],
        }),
      );
    },
  );

  it('returns only active delegatable Staff roles with permission grants', async () => {
    await repository.listAssignableStaffRoles({
      skip: 0,
      take: 100,
      search: 'cash',
      maxRoleLevel: 70,
    });

    const findManyInput = role.findMany.mock.calls[0][0];
    expect(findManyInput).toMatchObject({
      skip: 0,
      take: 100,
      where: {
        type: UserType.BRANCH,
        guardName: 'web',
        isActive: true,
        level: { lt: 70 },
        code: { notIn: ['SUPER_ADMIN', 'BRANCH_ADMIN', 'CUSTOMER'] },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        rolePermissions: {
          select: { permission: expect.any(Object) },
        },
      },
    });
    expect(findManyInput.where.OR).toHaveLength(3);
    expect(role.count).toHaveBeenCalledWith({ where: findManyInput.where });
  });
});
