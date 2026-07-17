import { Prisma, UserType } from '../src/generated/prisma/client';

export const ROLE_IDS = {
  SUPER_ADMIN: '01JZ0000000000000000000001',
  BRANCH_ADMIN: '01JZ0000000000000000000002',
  CUSTOMER: '01JZ0000000000000000000003',
  STAFF: '01JZ0000000000000000000004',
  INVENTORY: '01JZ0000000000000000000005',
  CASHIER: '01JZ0000000000000000000006',
} as const;

export const roles = [
  {
    id: ROLE_IDS.SUPER_ADMIN,
    code: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'Quản trị toàn hệ thống',
    type: UserType.SYSTEM,
    level: 100,
  },
  {
    id: ROLE_IDS.BRANCH_ADMIN,
    code: 'BRANCH_ADMIN',
    name: 'Branch Admin',
    description: 'Quản trị các chi nhánh được gán',
    type: UserType.BRANCH,
    level: 70,
  },
  {
    id: ROLE_IDS.STAFF,
    code: 'STAFF',
    name: 'Staff',
    description: 'Nhân viên chi nhánh',
    type: UserType.BRANCH,
    level: 30,
  },
  {
    id: ROLE_IDS.INVENTORY,
    code: 'INVENTORY',
    name: 'Inventory',
    description: 'Nhân viên kho',
    type: UserType.BRANCH,
    level: 30,
  },
  {
    id: ROLE_IDS.CASHIER,
    code: 'CASHIER',
    name: 'Cashier',
    description: 'Nhân viên thu ngân',
    type: UserType.BRANCH,
    level: 20,
  },
  {
    id: ROLE_IDS.CUSTOMER,
    code: 'CUSTOMER',
    name: 'Customer',
    description: 'Khách hàng Bookora',
    type: UserType.CUSTOMER,
    level: 10,
  },
] as const;

export const permissionCodes = [
  'dashboard.read',
  'users.read',
  'users.create',
  'users.update',
  'users.delete',
  'staff.read',
  'staff.create',
  'staff.update',
  'staff.delete',
  'staff.assign_role',
  'staff.assign_permission',
  'staff.assign_branch',
  'branches.read',
  'branches.create',
  'branches.update',
  'branches.delete',
  'branches.assign',
  'roles.read',
  'roles.create',
  'roles.update',
  'roles.delete',
  'roles.assign_permission',
  'permissions.read',
  'permissions.create',
  'permissions.update',
  'permissions.delete',
  'super_admin.assign',
  'branch_admin.assign',
  'orders.read',
  'orders.create',
  'orders.update_status',
  'payments.create',
  'products.read',
  'products.create',
  'products.update',
  'inventory.read',
  'inventory.update',
  'stock_movements.read',
  'stock_movements.create',
  'profile.read_own',
  'profile.update_own',
  'orders.create_own',
  'orders.read_own',
] as const;

const rolePermissionCodes: Record<string, readonly string[]> = {
  BRANCH_ADMIN: [
    'dashboard.read',
    'orders.read',
    'orders.update_status',
    'products.read',
    'inventory.read',
    'inventory.update',
    'staff.read',
    'staff.create',
    'staff.update',
    'staff.delete',
    'staff.assign_role',
    'staff.assign_permission',
  ],
  STAFF: [
    'dashboard.read',

    'orders.read',
    'orders.create',
    'orders.update_status',
    'payments.create',

    'products.read',
    'products.create',
    'products.update',

    'inventory.read',
    'inventory.update',

    'stock_movements.read',
    'stock_movements.create',
  ],
  CASHIER: [
    'dashboard.read',
    'orders.read',
    'orders.create',
    'orders.update_status',
    'payments.create',
  ],
  INVENTORY: [
    'dashboard.read',
    'products.read',
    'inventory.read',
    'inventory.update',
    'stock_movements.read',
    'stock_movements.create',
  ],
  CUSTOMER: [
    'profile.read_own',
    'profile.update_own',
    'orders.create_own',
    'orders.read_own',
  ],
};

const PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

type CatalogSeedClient = Pick<
  Prisma.TransactionClient,
  'role' | 'permission' | 'rolePermission'
>;

export async function seedCatalog(tx: CatalogSeedClient): Promise<void> {
  const roleIds = new Map<string, string>();
  for (const role of roles) {
    const persistedRole = await tx.role.upsert({
      where: { code: role.code },
      create: { ...role, guardName: 'web', isSystem: true, isActive: true },
      update: {
        name: role.name,
        description: role.description,
        guardName: 'web',
        type: role.type,
        level: role.level,
        isSystem: true,
      },
      select: { id: true, code: true },
    });
    roleIds.set(persistedRole.code, persistedRole.id);
  }

  const permissionIds = new Map<string, string>();
  for (const code of permissionCodes) {
    if (!PERMISSION_CODE_PATTERN.test(code)) {
      throw new Error(`Invalid permission code: ${code}`);
    }

    const [resource, action] = code.split('.') as [string, string];
    const permission = await tx.permission.upsert({
      where: { code },
      create: {
        code,
        name: toDisplayName(code),
        resource,
        action,
        guardName: 'web',
      },
      update: {
        name: toDisplayName(code),
        resource,
        action,
        guardName: 'web',
      },
      select: { id: true, code: true },
    });
    permissionIds.set(permission.code, permission.id);
  }

  const superAdminRoleId = roleIds.get('SUPER_ADMIN');
  if (!superAdminRoleId) {
    throw new Error('Seeded role not found: SUPER_ADMIN');
  }
  const allPermissions = await tx.permission.findMany({
    select: { id: true },
  });
  for (const permission of allPermissions) {
    await tx.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: superAdminRoleId,
          permissionId: permission.id,
        },
      },
      create: {
        roleId: superAdminRoleId,
        permissionId: permission.id,
      },
      update: {},
    });
  }

  for (const [roleCode, codes] of Object.entries(rolePermissionCodes)) {
    const roleId = roleIds.get(roleCode);
    if (!roleId) {
      throw new Error(`Seeded role not found: ${roleCode}`);
    }

    for (const permissionCode of codes) {
      const permissionId = permissionIds.get(permissionCode);
      if (!permissionId) {
        throw new Error(`Seeded permission not found: ${permissionCode}`);
      }

      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        create: { roleId, permissionId },
        update: {},
      });
    }
  }
}

function toDisplayName(code: string): string {
  return code
    .split(/[._]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
