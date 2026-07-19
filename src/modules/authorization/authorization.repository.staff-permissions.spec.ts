import { AuthorizationRepository } from './authorization.repository';

describe('AuthorizationRepository Staff permission catalog', () => {
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

  it('filters by business resources, actor ownership and dangerous codes', async () => {
    await repository.listAssignableStaffPermissions({
      skip: 0,
      take: 100,
      search: 'order',
      actorPermissionCodes: ['orders.read', 'roles.read'],
      permissionCodes: ['orders.read', 'inventory.read'],
      excludedCodes: ['branches.assign'],
    });

    const input = permission.findMany.mock.calls[0][0];
    expect(input).toMatchObject({
      skip: 0,
      take: 100,
      where: {
        guardName: 'web',
        code: {
          in: ['orders.read'],
          notIn: ['branches.assign'],
        },
      },
      orderBy: [{ resource: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    expect(input.where.OR).toHaveLength(4);
    expect(permission.count).toHaveBeenCalledWith({ where: input.where });
  });
});
