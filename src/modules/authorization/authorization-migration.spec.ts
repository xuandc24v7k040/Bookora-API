import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('authorization phase 1 migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260621090000_authorization_phase_1/migration.sql',
    ),
    'utf8',
  );

  it('backfills nullable User.type before enforcing NOT NULL', () => {
    const addNullableType = sql.indexOf('ADD COLUMN "type" "UserType"');
    const backfillType = sql.indexOf('UPDATE "users"');
    const verifyType = sql.indexOf('users.type backfill is incomplete');
    const enforceNotNull = sql.indexOf('ALTER COLUMN "type" SET NOT NULL');

    expect(addNullableType).toBeGreaterThanOrEqual(0);
    expect(backfillType).toBeGreaterThan(addNullableType);
    expect(verifyType).toBeGreaterThan(backfillType);
    expect(enforceNotNull).toBeGreaterThan(verifyType);
  });

  it('backfills legacy BRANCH_ADMIN branch as active primary UserBranch', () => {
    expect(sql).toContain(
      'SELECT u."id", u."branch_id", true, true, NULL, CURRENT_TIMESTAMP',
    );
    expect(sql).toContain('WHERE u."role" = \'BRANCH_ADMIN\'::"Role"');
    expect(sql).toContain('AND u."branch_id" IS NOT NULL');
  });

  it('aborts before backfill when legacy BRANCH_ADMIN has no active valid branch', () => {
    const validation = sql.indexOf(
      'Authorization migration aborted: % legacy BRANCH_ADMIN users have missing, unknown, or inactive branch_id',
    );
    const backfillType = sql.indexOf('UPDATE "users"');
    const branchBackfill = sql.indexOf('INSERT INTO "user_branches"');
    const dropLegacyBranch = sql.indexOf('DROP COLUMN "branch_id"');

    expect(validation).toBeGreaterThanOrEqual(0);
    expect(validation).toBeLessThan(backfillType);
    expect(validation).toBeLessThan(branchBackfill);
    expect(validation).toBeLessThan(dropLegacyBranch);
    expect(sql).toContain('u."branch_id" IS NULL');
    expect(sql).toContain('b."id" IS NULL');
    expect(sql).toContain('b."is_active" = false');
    expect(sql).toContain('Sample user IDs');
  });

  it('counts all invalid legacy Branch Admin users while sampling only ten IDs', () => {
    expect(sql).toContain('(SELECT COUNT(*) FROM invalid_users)');
    expect(sql).toContain('LIMIT 10');
    expect(sql).toContain('STRING_AGG(sample_users."id", \', \'');
  });

  it('drops legacy role enum only after role and branch backfills', () => {
    const userRoleBackfill = sql.indexOf('INSERT INTO "user_roles"');
    const userBranchBackfill = sql.indexOf('INSERT INTO "user_branches"');
    const dropRoleColumn = sql.indexOf('DROP COLUMN "role"');
    const dropRoleEnum = sql.indexOf('DROP TYPE "Role"');

    expect(dropRoleColumn).toBeGreaterThan(userRoleBackfill);
    expect(dropRoleColumn).toBeGreaterThan(userBranchBackfill);
    expect(dropRoleEnum).toBeGreaterThan(dropRoleColumn);
  });

  it('uses stable valid ULIDs for the three backfill roles', () => {
    const ids = [
      '01JZ0000000000000000000001',
      '01JZ0000000000000000000002',
      '01JZ0000000000000000000003',
    ];

    for (const id of ids) {
      expect(id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
      expect(sql).toContain(id);
    }
  });
});

describe('branch-scoped staff authorization migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260623120000_branch_scoped_staff_assignments/migration.sql',
    ),
    'utf8',
  );

  it('creates UserBranchRole and UserBranchPermission before backfill', () => {
    const roleTable = sql.indexOf('CREATE TABLE "user_branch_roles"');
    const permissionTable = sql.indexOf(
      'CREATE TABLE "user_branch_permissions"',
    );
    const roleBackfill = sql.indexOf('INSERT INTO "user_branch_roles"');
    const permissionBackfill = sql.indexOf(
      'INSERT INTO "user_branch_permissions"',
    );

    expect(roleTable).toBeGreaterThanOrEqual(0);
    expect(permissionTable).toBeGreaterThanOrEqual(0);
    expect(roleBackfill).toBeGreaterThan(roleTable);
    expect(permissionBackfill).toBeGreaterThan(permissionTable);
    expect(sql).toContain('REFERENCES "user_branches"("id")');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "user_branch_roles_user_branch_id_role_id_key"',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "user_branch_permissions_user_branch_id_permission_id_key"',
    );
  });

  it('aborts ambiguous multi-branch global assignments before cleanup', () => {
    const validation = sql.indexOf(
      'BRANCH users need manual branch auth mapping or branch cleanup',
    );
    const roleCleanup = sql.indexOf('DELETE FROM "user_roles"');
    const permissionCleanup = sql.indexOf('DELETE FROM "user_permissions"');

    expect(validation).toBeGreaterThanOrEqual(0);
    expect(validation).toBeLessThan(roleCleanup);
    expect(validation).toBeLessThan(permissionCleanup);
    expect(sql).toContain('abc.active_count > 1');
    expect(sql).toContain('Sample user IDs');
  });

  it('moves single-branch branch-user roles and permissions to selected UserBranch', () => {
    expect(sql).toContain('HAVING COUNT(*) = 1');
    expect(sql).toContain('sbu."user_branch_id"');
    expect(sql).toContain('r."type" = \'BRANCH\'::"UserType"');
    expect(sql).toContain('ON CONFLICT ("user_branch_id", "role_id")');
    expect(sql).toContain('ON CONFLICT ("user_branch_id", "permission_id")');
  });

  it('keeps SYSTEM/CUSTOMER global assignments by cleaning only BRANCH users', () => {
    expect(sql).toContain('u."type" = \'BRANCH\'::"UserType"');
    expect(sql).toContain('SYSTEM/CUSTOMER users have branch assignments');
    expect(sql).toContain('WHERE up."user_id" = u."id"');
  });

  it('preflights invalid primary and role data before structural changes', () => {
    const preflight = sql.indexOf('migration preflight failed for % users');
    const addId = sql.indexOf('ADD COLUMN "id" TEXT');
    const cleanup = sql.indexOf('DELETE FROM "user_roles"');

    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(preflight).toBeLessThan(addId);
    expect(preflight).toBeLessThan(cleanup);
    expect(sql).toContain('ub."is_primary" = true');
    expect(sql).toContain('r."is_active" = false');
    expect(sql).toContain('r."type" <> \'BRANCH\'::"UserType"');
    expect(sql).toContain(') <> 1');
    expect(sql).toContain("'0' || upper(substr(md5(random()::text");
    expect(sql).toContain(
      'CONSTRAINT "user_branches_primary_must_be_active_check"',
    );
  });
});
