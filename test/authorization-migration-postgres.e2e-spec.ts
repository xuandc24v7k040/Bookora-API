import { DatabaseError } from 'pg';
import {
  createDisposablePostgresDatabase,
  type DisposablePostgresDatabase,
  runBranchScopedMigrationInTransaction,
  runMigrations,
} from './helpers/postgres-test-database';

const IDS = {
  branchHauGiang: '01K00000000000000000000001',
  branchCanTho: '01K00000000000000000000002',
  branchInactive: '01K00000000000000000000003',
  systemUser: '01K00000000000000000000004',
  customerUser: '01K00000000000000000000005',
  branchUser: '01K00000000000000000000006',
  secondBranchUser: '01K00000000000000000000007',
  staffRole: '01K00000000000000000000008',
  cashierRole: '01K00000000000000000000009',
  inactiveRole: '01K0000000000000000000000A',
  inventoryPermission: '01K0000000000000000000000B',
  paymentsPermission: '01K0000000000000000000000C',
  customerPermission: '01K0000000000000000000000D',
} as const;

const SUPER_ADMIN_ROLE_ID = '01JZ0000000000000000000001';
const CUSTOMER_ROLE_ID = '01JZ0000000000000000000003';

describe('branch-scoped authorization PostgreSQL migration fixture (e2e)', () => {
  jest.setTimeout(120_000);

  it('backfills a valid single-branch BRANCH user and enforces final constraints', async () => {
    const database = await createLegacyDatabase('migration_valid');
    try {
      await seedBranchesRolesPermissions(database);
      await seedUser(database, IDS.systemUser, 'system@example.test', 'SYSTEM');
      await seedUser(
        database,
        IDS.customerUser,
        'customer@example.test',
        'CUSTOMER',
      );
      await seedUser(database, IDS.branchUser, 'branch@example.test', 'BRANCH');
      await database.runSql(`
        INSERT INTO "user_roles" ("user_id", "role_id")
        VALUES
          ('${IDS.systemUser}', '${SUPER_ADMIN_ROLE_ID}'),
          ('${IDS.customerUser}', '${CUSTOMER_ROLE_ID}'),
          ('${IDS.branchUser}', '${IDS.staffRole}');

        INSERT INTO "user_permissions" ("user_id", "permission_id", "effect")
        VALUES
          ('${IDS.customerUser}', '${IDS.customerPermission}', 'ALLOW'),
          ('${IDS.branchUser}', '${IDS.inventoryPermission}', 'ALLOW'),
          ('${IDS.branchUser}', '${IDS.paymentsPermission}', 'DENY');

        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES ('${IDS.branchUser}', '${IDS.branchHauGiang}', true, true);
      `);

      await runBranchScopedMigrationInTransaction(database);

      const branchAssignments = await database.query<{
        user_branch_id: string;
        role_count: string;
        permission_count: string;
        allow_count: string;
        deny_count: string;
      }>(
        `
        SELECT
          ub."id" AS "user_branch_id",
          COUNT(DISTINCT ubr."role_id") AS "role_count",
          COUNT(DISTINCT ubp."permission_id") AS "permission_count",
          COUNT(DISTINCT ubp."permission_id") FILTER (WHERE ubp."effect" = 'ALLOW') AS "allow_count",
          COUNT(DISTINCT ubp."permission_id") FILTER (WHERE ubp."effect" = 'DENY') AS "deny_count"
        FROM "user_branches" ub
        LEFT JOIN "user_branch_roles" ubr ON ubr."user_branch_id" = ub."id"
        LEFT JOIN "user_branch_permissions" ubp ON ubp."user_branch_id" = ub."id"
        WHERE ub."user_id" = $1
        GROUP BY ub."id"
      `,
        [IDS.branchUser],
      );
      expect(branchAssignments).toEqual([
        expect.objectContaining({
          role_count: '1',
          permission_count: '2',
          allow_count: '1',
          deny_count: '1',
        }),
      ]);
      expect(branchAssignments[0].user_branch_id).toMatch(
        /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/,
      );
      const activePrimary = await database.query<{ count: string }>(
        `
        SELECT COUNT(*) AS count
        FROM "user_branches"
        WHERE "user_id" = $1 AND "is_active" = true AND "is_primary" = true
        `,
        [IDS.branchUser],
      );
      expect(activePrimary).toEqual([{ count: '1' }]);

      await expectCount(database, 'user_roles', IDS.branchUser, 0);
      await expectCount(database, 'user_permissions', IDS.branchUser, 0);
      await expectCount(database, 'user_roles', IDS.systemUser, 1);
      await expectCount(database, 'user_roles', IDS.customerUser, 1);
      await expectCount(database, 'user_permissions', IDS.customerUser, 1);

      await expect(
        database.runSql(`
          INSERT INTO "user_branches" ("id", "user_id", "branch_id", "is_primary", "is_active")
          VALUES ('01K0000000000000000000000E', '${IDS.branchUser}', '${IDS.branchCanTho}', true, true)
        `),
      ).rejects.toThrow(DatabaseError);
      await expect(
        database.runSql(`
          INSERT INTO "user_branches" ("id", "user_id", "branch_id", "is_primary", "is_active")
          VALUES ('01K0000000000000000000000F', '${IDS.secondBranchUser}', '${IDS.branchCanTho}', true, false)
        `),
      ).rejects.toThrow(DatabaseError);
      await expect(
        database.runSql(`
          INSERT INTO "user_branch_roles" ("id", "user_branch_id", "role_id")
          VALUES ('01K0000000000000000000000G', '${branchAssignments[0].user_branch_id}', '${IDS.staffRole}')
        `),
      ).rejects.toThrow(DatabaseError);
      await expect(
        database.runSql(`
          INSERT INTO "user_branch_permissions" ("id", "user_branch_id", "permission_id", "effect")
          VALUES ('01K0000000000000000000000J', '${branchAssignments[0].user_branch_id}', '${IDS.inventoryPermission}', 'ALLOW')
        `),
      ).rejects.toThrow(DatabaseError);
      await expect(
        database.runSql(`
          INSERT INTO "user_branch_permissions" ("id", "user_branch_id", "permission_id", "effect")
          VALUES ('01K0000000000000000000000K', '01K0000000000000000000000Z', '${IDS.inventoryPermission}', 'ALLOW')
        `),
      ).rejects.toThrow(DatabaseError);
      await expect(
        database.runSql(`
          INSERT INTO "user_branch_roles" ("id", "user_branch_id", "role_id")
          VALUES ('01K0000000000000000000000H', '01K0000000000000000000000Z', '${IDS.staffRole}')
        `),
      ).rejects.toThrow(DatabaseError);
    } finally {
      await database.close();
    }
  });

  it.each([
    [
      'multi-branch ambiguous global role',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.branchUser}', 'multi@example.test', 'BRANCH', CURRENT_TIMESTAMP);
        INSERT INTO "user_roles" ("user_id", "role_id")
        VALUES ('${IDS.branchUser}', '${IDS.staffRole}');
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES
          ('${IDS.branchUser}', '${IDS.branchHauGiang}', true, true),
          ('${IDS.branchUser}', '${IDS.branchCanTho}', false, true);
      `,
      'manual branch auth mapping',
    ],
    [
      'multi-branch ambiguous global direct permission',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.branchUser}', 'multi-permission@example.test', 'BRANCH', CURRENT_TIMESTAMP);
        INSERT INTO "user_permissions" ("user_id", "permission_id", "effect")
        VALUES ('${IDS.branchUser}', '${IDS.inventoryPermission}', 'ALLOW');
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES
          ('${IDS.branchUser}', '${IDS.branchHauGiang}', true, true),
          ('${IDS.branchUser}', '${IDS.branchCanTho}', false, true);
      `,
      'manual branch auth mapping',
    ],
    [
      'BRANCH user without active branch',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.branchUser}', 'no-branch@example.test', 'BRANCH', CURRENT_TIMESTAMP);
        INSERT INTO "user_roles" ("user_id", "role_id")
        VALUES ('${IDS.branchUser}', '${IDS.staffRole}');
      `,
      'preflight failed',
    ],
    [
      'assignment points to inactive branch',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.branchUser}', 'inactive-branch@example.test', 'BRANCH', CURRENT_TIMESTAMP);
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES ('${IDS.branchUser}', '${IDS.branchInactive}', true, true);
      `,
      'preflight failed',
    ],
    [
      'missing active primary',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.branchUser}', 'missing-primary@example.test', 'BRANCH', CURRENT_TIMESTAMP);
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES ('${IDS.branchUser}', '${IDS.branchHauGiang}', false, true);
      `,
      'preflight failed',
    ],
    [
      'duplicate active primary',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.branchUser}', 'duplicate-primary@example.test', 'BRANCH', CURRENT_TIMESTAMP);
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES
          ('${IDS.branchUser}', '${IDS.branchHauGiang}', true, true),
          ('${IDS.branchUser}', '${IDS.branchCanTho}', true, true);
      `,
      'preflight failed',
    ],
    [
      'primary branch inactive',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.branchUser}', 'primary-inactive@example.test', 'BRANCH', CURRENT_TIMESTAMP);
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES ('${IDS.branchUser}', '${IDS.branchHauGiang}', true, false);
      `,
      'preflight failed',
    ],
    [
      'SYSTEM user has branch authorization',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.systemUser}', 'system-branch@example.test', 'SYSTEM', CURRENT_TIMESTAMP);
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES ('${IDS.systemUser}', '${IDS.branchHauGiang}', true, true);
      `,
      'preflight failed',
    ],
    [
      'CUSTOMER user has branch authorization',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.customerUser}', 'customer-branch@example.test', 'CUSTOMER', CURRENT_TIMESTAMP);
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES ('${IDS.customerUser}', '${IDS.branchHauGiang}', true, true);
      `,
      'preflight failed',
    ],
    [
      'BRANCH user has inactive global role',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.branchUser}', 'inactive-role@example.test', 'BRANCH', CURRENT_TIMESTAMP);
        INSERT INTO "user_roles" ("user_id", "role_id")
        VALUES ('${IDS.branchUser}', '${IDS.inactiveRole}');
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES ('${IDS.branchUser}', '${IDS.branchHauGiang}', true, true);
      `,
      'preflight failed',
    ],
    [
      'BRANCH user has wrong-type global role',
      `
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ('${IDS.branchUser}', 'wrong-type-role@example.test', 'BRANCH', CURRENT_TIMESTAMP);
        INSERT INTO "user_roles" ("user_id", "role_id")
        VALUES ('${IDS.branchUser}', '${CUSTOMER_ROLE_ID}');
        INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active")
        VALUES ('${IDS.branchUser}', '${IDS.branchHauGiang}', true, true);
      `,
      'preflight failed',
    ],
  ])('aborts and rolls back for %s', async (_caseName, invalidSql, message) => {
    const database = await createLegacyDatabase(`migration_abort_${_caseName}`);
    try {
      await seedBranchesRolesPermissions(database);
      await database.runSql(invalidSql);
      const before = await legacyState(database);

      let migrationError: unknown;
      try {
        await runBranchScopedMigrationInTransaction(database);
      } catch (error) {
        migrationError = error;
      }
      expect(migrationError).toBeInstanceOf(DatabaseError);
      const errorMessage = (migrationError as Error).message;
      expect(errorMessage).toContain(message);
      expect(errorMessage).toContain('1');
      expect(errorMessage).toContain(
        _caseName.startsWith('SYSTEM')
          ? IDS.systemUser
          : _caseName.startsWith('CUSTOMER')
            ? IDS.customerUser
            : IDS.branchUser,
      );

      const userBranchIdColumn = await database.query<{ column_name: string }>(
        `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'user_branches' AND column_name = 'id'
        `,
      );
      expect(userBranchIdColumn).toEqual([]);
      const branchScopedTables = await database.query<{ table_name: string }>(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name IN ('user_branch_roles', 'user_branch_permissions')
        `,
      );
      expect(branchScopedTables).toEqual([]);
      expect(await legacyState(database)).toEqual(before);
    } finally {
      await database.close();
    }
  });

  it('reports the exact invalid count and limits sample IDs to ten', async () => {
    const database = await createLegacyDatabase('migration_sample_limit');
    const invalidUserIds = Array.from(
      { length: 12 },
      (_, index) => `01K${String(index + 100).padStart(23, '0')}`,
    );
    try {
      await seedBranchesRolesPermissions(database);
      await database.runSql(`
        INSERT INTO "users" ("id", "email", "type", "updated_at")
        VALUES ${invalidUserIds
          .map(
            (id, index) =>
              `('${id}', 'invalid-${index}@example.test', 'BRANCH', CURRENT_TIMESTAMP)`,
          )
          .join(', ')}
      `);
      const before = await legacyState(database);

      let migrationError: unknown;
      try {
        await runBranchScopedMigrationInTransaction(database);
      } catch (error) {
        migrationError = error;
      }

      expect(migrationError).toBeInstanceOf(DatabaseError);
      const errorMessage = (migrationError as Error).message;
      expect(errorMessage).toContain('failed for 12 users');
      for (const id of invalidUserIds.slice(0, 10)) {
        expect(errorMessage).toContain(id);
      }
      for (const id of invalidUserIds.slice(10)) {
        expect(errorMessage).not.toContain(id);
      }
      expect(await legacyState(database)).toEqual(before);
      expect(
        await database.query(
          `SELECT 1 FROM information_schema.tables WHERE table_name = 'user_branch_roles'`,
        ),
      ).toEqual([]);
    } finally {
      await database.close();
    }
  });
});

async function createLegacyDatabase(
  label: string,
): Promise<DisposablePostgresDatabase> {
  const database = await createDisposablePostgresDatabase(label);
  await runMigrations(database, [
    '20260604082015_init',
    '20260621090000_authorization_phase_1',
  ]);
  return database;
}

async function seedBranchesRolesPermissions(
  database: DisposablePostgresDatabase,
): Promise<void> {
  await database.runSql(`
    INSERT INTO "branches" ("id", "name", "code", "address", "is_active", "updated_at")
    VALUES
      ('${IDS.branchHauGiang}', 'Hậu Giang', 'hau-giang', 'Hậu Giang', true, CURRENT_TIMESTAMP),
      ('${IDS.branchCanTho}', 'Cần Thơ', 'can-tho', 'Cần Thơ', true, CURRENT_TIMESTAMP),
      ('${IDS.branchInactive}', 'Inactive', 'inactive', 'Inactive', false, CURRENT_TIMESTAMP);

    INSERT INTO "roles" ("id", "code", "name", "type", "level", "is_system", "is_active", "updated_at")
    VALUES
      ('${IDS.staffRole}', 'STAFF', 'Staff', 'BRANCH', 10, true, true, CURRENT_TIMESTAMP),
      ('${IDS.cashierRole}', 'CASHIER', 'Cashier', 'BRANCH', 5, true, true, CURRENT_TIMESTAMP),
      ('${IDS.inactiveRole}', 'INACTIVE_STAFF', 'Inactive Staff', 'BRANCH', 10, true, false, CURRENT_TIMESTAMP);

    INSERT INTO "permissions" ("id", "code", "name", "resource", "action", "updated_at")
    VALUES
      ('${IDS.inventoryPermission}', 'inventory.update', 'Update inventory', 'inventory', 'update', CURRENT_TIMESTAMP),
      ('${IDS.paymentsPermission}', 'payments.create', 'Create payments', 'payments', 'create', CURRENT_TIMESTAMP),
      ('${IDS.customerPermission}', 'profile.read', 'Read profile', 'profile', 'read', CURRENT_TIMESTAMP);
  `);
}

async function seedUser(
  database: DisposablePostgresDatabase,
  id: string,
  email: string,
  type: 'SYSTEM' | 'BRANCH' | 'CUSTOMER',
): Promise<void> {
  await database.runSql(`
    INSERT INTO "users" ("id", "email", "type", "updated_at")
    VALUES ('${id}', '${email}', '${type}', CURRENT_TIMESTAMP)
  `);
}

async function expectCount(
  database: DisposablePostgresDatabase,
  table: 'user_roles' | 'user_permissions',
  userId: string,
  expected: number,
): Promise<void> {
  const rows = await database.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM "${table}" WHERE "user_id" = $1`,
    [userId],
  );
  expect(Number(rows[0].count)).toBe(expected);
}

async function legacyState(database: DisposablePostgresDatabase) {
  const rows = await database.query<{
    user_count: string;
    user_branch_count: string;
    user_role_count: string;
    user_permission_count: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM "users") AS user_count,
      (SELECT COUNT(*) FROM "user_branches") AS user_branch_count,
      (SELECT COUNT(*) FROM "user_roles") AS user_role_count,
      (SELECT COUNT(*) FROM "user_permissions") AS user_permission_count
  `);
  return rows[0];
}
