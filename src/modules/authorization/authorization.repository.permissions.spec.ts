import { AuthorizationRepository } from './authorization.repository';
import { PermissionSortField } from './dto';

describe('AuthorizationRepository permission catalog', () => {
  const permission = {
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const repository = new AuthorizationRepository({ permission } as never);

  beforeEach(() => {
    jest.clearAllMocks();
    permission.findMany.mockResolvedValue([]);
    permission.count.mockResolvedValue(0);
  });

  it('composes search and filters into the same where for data and count', async () => {
    await repository.listPermissions({
      skip: 20,
      take: 10,
      search: 'role',
      resource: 'roles',
      action: 'read',
      guardName: 'web',
      createdFrom: new Date('2026-06-30T17:00:00.000Z'),
      createdTo: new Date('2026-07-02T17:00:00.000Z'),
      sortBy: PermissionSortField.NAME,
      sortOrder: 'asc',
    });

    const findManyInput = permission.findMany.mock.calls[0][0];
    expect(findManyInput).toMatchObject({
      skip: 20,
      take: 10,
      where: {
        resource: 'roles',
        action: 'read',
        guardName: 'web',
        createdAt: {
          gte: new Date('2026-06-30T17:00:00.000Z'),
          lt: new Date('2026-07-02T17:00:00.000Z'),
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    expect(findManyInput.where.OR).toHaveLength(5);
    expect(permission.count).toHaveBeenCalledWith({
      where: findManyInput.where,
    });
  });

  it.each(Object.values(PermissionSortField))(
    'uses deterministic ordering for %s',
    async (sortBy) => {
      await repository.listPermissions({
        skip: 0,
        take: 10,
        sortBy,
        sortOrder: 'desc',
      });

      expect(permission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ [sortBy]: 'desc' }, { id: 'asc' }],
        }),
      );
    },
  );
});
