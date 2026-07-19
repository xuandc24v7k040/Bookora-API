import {
  permissionCatalog,
  permissionCodes,
  roles,
  seedCatalog,
} from '../../../prisma/catalog.seed';

describe('production authorization catalog seed', () => {
  it('keeps technical codes stable and localizes every production item', () => {
    expect(new Set(permissionCodes).size).toBe(permissionCodes.length);
    expect(permissionCatalog).toHaveLength(permissionCodes.length);
    expect(
      permissionCatalog.every(({ name, description }) => name && description),
    ).toBe(true);
    expect(roles.every(({ name, description }) => name && description)).toBe(
      true,
    );
    expect(permissionCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'staff.read',
          name: 'Xem nhân viên chi nhánh',
        }),
        expect.objectContaining({
          code: 'orders.read',
          name: 'Xem đơn hàng',
        }),
        expect.objectContaining({
          code: 'inventory.update',
          name: 'Cập nhật tồn kho',
        }),
      ]),
    );
  });

  it('reconciles the same Role, Permission and mapping keys on repeated runs', async () => {
    const role = {
      upsert: jest.fn(({ where }) =>
        Promise.resolve({ id: `role-${where.code}`, code: where.code }),
      ),
    };
    const permission = {
      upsert: jest.fn(({ where }) =>
        Promise.resolve({
          id: `permission-${where.code}`,
          code: where.code,
        }),
      ),
      findMany: jest.fn(() =>
        Promise.resolve(
          permissionCodes.map((code) => ({ id: `permission-${code}` })),
        ),
      ),
    };
    const rolePermission = {
      upsert: jest.fn(() => Promise.resolve({})),
    };
    const client = { role, permission, rolePermission } as never;

    await seedCatalog(client);
    const firstRoleKeys = role.upsert.mock.calls.map(
      ([input]) => input.where.code,
    );
    const firstPermissionKeys = permission.upsert.mock.calls.map(
      ([input]) => input.where.code,
    );
    const firstMappingCount = rolePermission.upsert.mock.calls.length;

    jest.clearAllMocks();
    await seedCatalog(client);

    expect(role.upsert.mock.calls.map(([input]) => input.where.code)).toEqual(
      firstRoleKeys,
    );
    expect(
      permission.upsert.mock.calls.map(([input]) => input.where.code),
    ).toEqual(firstPermissionKeys);
    expect(rolePermission.upsert).toHaveBeenCalledTimes(firstMappingCount);
  });
});
