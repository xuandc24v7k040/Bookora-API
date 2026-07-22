import {
  permissionCatalog,
  permissionCodes,
  roles,
  seedCatalog,
  STAFF_PERMISSION_CODES,
} from '../../../prisma/catalog.seed';

const EXPECTED_STAFF_PERMISSION_CODES = [
  'dashboard.read',
  'orders.read',
  'orders.create',
  'orders.update_status',
  'payments.create',
  'products.read',
  'inventory.read',
  'inventory.update_threshold',
  'stock_receipts.read',
  'stock_receipts.create',
  'stock_receipts.update',
  'stock_receipts.cancel',
  'stock_receipts.confirm',
] as const;

describe('production authorization catalog seed', () => {
  it('defines the exact authoritative STAFF permission set', () => {
    expect(STAFF_PERMISSION_CODES).toEqual(EXPECTED_STAFF_PERMISSION_CODES);
    expect(STAFF_PERMISSION_CODES).toHaveLength(13);
    expect(STAFF_PERMISSION_CODES).not.toEqual(
      expect.arrayContaining([
        'products.create',
        'products.update',
        'products.delete',
      ]),
    );
    expect(
      STAFF_PERMISSION_CODES.some((code) => code.startsWith('staff.')),
    ).toBe(false);
    expect(
      STAFF_PERMISSION_CODES.filter((code) =>
        code.startsWith('stock_receipts.'),
      ),
    ).toEqual([
      'stock_receipts.read',
      'stock_receipts.create',
      'stock_receipts.update',
      'stock_receipts.cancel',
      'stock_receipts.confirm',
    ]);
  });

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
          code: 'inventory.update_threshold',
          name: 'Cập nhật ngưỡng cảnh báo tồn kho',
        }),
        expect.objectContaining({
          code: 'stock_receipts.confirm',
          name: 'Xác nhận phiếu nhập kho',
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
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
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
    expect(rolePermission.deleteMany).toHaveBeenCalledTimes(5);
  });

  it('removes obsolete STAFF mappings while preserving custom roles', async () => {
    const role = {
      upsert: jest.fn(({ where }) =>
        Promise.resolve({ id: `role-${where.code}`, code: where.code }),
      ),
    };
    const permission = {
      upsert: jest.fn(({ where }) =>
        Promise.resolve({ id: `permission-${where.code}`, code: where.code }),
      ),
      findMany: jest.fn(() => Promise.resolve([])),
    };
    const rolePermission = {
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
      upsert: jest.fn(() => Promise.resolve({})),
    };

    await seedCatalog({ role, permission, rolePermission } as never);

    expect(rolePermission.deleteMany).toHaveBeenCalledWith({
      where: {
        roleId: 'role-STAFF',
        permission: {
          code: {
            notIn: [...EXPECTED_STAFF_PERMISSION_CODES],
          },
        },
      },
    });
    expect(rolePermission.deleteMany).toHaveBeenCalledTimes(5);
  });
});
