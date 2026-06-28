-- Create authorization enums without touching the legacy "Role" enum yet.
CREATE TYPE "UserType" AS ENUM ('SYSTEM', 'BRANCH', 'CUSTOMER');
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- User.type must remain nullable until every legacy user has been backfilled.
ALTER TABLE "users"
ADD COLUMN "type" "UserType",
ADD COLUMN "last_login_at" TIMESTAMP(3);

CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "guard_name" TEXT NOT NULL DEFAULT 'web',
    "type" "UserType" NOT NULL,
    "level" INTEGER NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "guard_name" TEXT NOT NULL DEFAULT 'web',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_by" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "user_permissions" (
    "user_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "assigned_by" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "user_branches" (
    "user_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_by" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE INDEX "roles_type_is_active_idx" ON "roles"("type", "is_active");
CREATE INDEX "roles_guard_name_idx" ON "roles"("guard_name");
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "permissions_resource_action_idx" ON "permissions"("resource", "action");
CREATE INDEX "permissions_guard_name_idx" ON "permissions"("guard_name");
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");
CREATE INDEX "user_roles_assigned_by_idx" ON "user_roles"("assigned_by");
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE UNIQUE INDEX "user_permissions_user_id_permission_id_key" ON "user_permissions"("user_id", "permission_id");
CREATE INDEX "user_permissions_permission_id_idx" ON "user_permissions"("permission_id");
CREATE INDEX "user_permissions_assigned_by_idx" ON "user_permissions"("assigned_by");
CREATE UNIQUE INDEX "user_branches_user_id_branch_id_key" ON "user_branches"("user_id", "branch_id");
CREATE INDEX "user_branches_branch_id_idx" ON "user_branches"("branch_id");
CREATE INDEX "user_branches_assigned_by_idx" ON "user_branches"("assigned_by");

ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- These roles must exist before legacy users are assigned. Seed reuses these IDs.
INSERT INTO "roles" (
    "id", "code", "name", "description", "guard_name", "type", "level",
    "is_system", "is_active", "created_at", "updated_at"
)
VALUES
    ('01JZ0000000000000000000001', 'SUPER_ADMIN', 'Super Admin', 'Quản trị toàn hệ thống', 'web', 'SYSTEM', 100, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JZ0000000000000000000002', 'BRANCH_ADMIN', 'Branch Admin', 'Quản trị các chi nhánh được gán', 'web', 'BRANCH', 70, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JZ0000000000000000000003', 'CUSTOMER', 'Customer', 'Khách hàng Bookora', 'web', 'CUSTOMER', 10, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

DO $$
DECLARE
    invalid_count INTEGER;
    sample_user_ids TEXT;
BEGIN
    WITH invalid_users AS (
        SELECT u."id"
        FROM "users" u
        LEFT JOIN "branches" b ON b."id" = u."branch_id"
        WHERE u."role" = 'BRANCH_ADMIN'::"Role"
          AND (
              u."branch_id" IS NULL
              OR b."id" IS NULL
              OR b."is_active" = false
          )
    ),
    sample_users AS (
        SELECT invalid_users."id"
        FROM invalid_users
        ORDER BY invalid_users."id"
        LIMIT 10
    )
    SELECT
        (SELECT COUNT(*) FROM invalid_users),
        (SELECT STRING_AGG(sample_users."id", ', ' ORDER BY sample_users."id") FROM sample_users)
    INTO invalid_count, sample_user_ids;

    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Authorization migration aborted: % legacy BRANCH_ADMIN users have missing, unknown, or inactive branch_id. Sample user IDs: %',
            invalid_count,
            sample_user_ids;
    END IF;
END $$;

UPDATE "users"
SET "type" = CASE "role"
    WHEN 'SUPER_ADMIN'::"Role" THEN 'SYSTEM'::"UserType"
    WHEN 'BRANCH_ADMIN'::"Role" THEN 'BRANCH'::"UserType"
    WHEN 'USER'::"Role" THEN 'CUSTOMER'::"UserType"
END;

INSERT INTO "user_roles" ("user_id", "role_id", "assigned_by", "assigned_at")
SELECT
    u."id",
    CASE u."role"
        WHEN 'SUPER_ADMIN'::"Role" THEN '01JZ0000000000000000000001'
        WHEN 'BRANCH_ADMIN'::"Role" THEN '01JZ0000000000000000000002'
        WHEN 'USER'::"Role" THEN '01JZ0000000000000000000003'
    END,
    NULL,
    CURRENT_TIMESTAMP
FROM "users" u;

INSERT INTO "user_branches" ("user_id", "branch_id", "is_primary", "is_active", "assigned_by", "assigned_at")
SELECT u."id", u."branch_id", true, true, NULL, CURRENT_TIMESTAMP
FROM "users" u
WHERE u."role" = 'BRANCH_ADMIN'::"Role"
  AND u."branch_id" IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "users" WHERE "type" IS NULL) THEN
        RAISE EXCEPTION 'Authorization migration aborted: users.type backfill is incomplete';
    END IF;
END $$;

ALTER TABLE "users"
ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "type" SET DEFAULT 'CUSTOMER'::"UserType";

-- Drop legacy authorization columns only after every backfill and verification succeeds.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_branch_id_fkey";
DROP INDEX IF EXISTS "users_branch_id_idx";
ALTER TABLE "users" DROP COLUMN "branch_id";
ALTER TABLE "users" DROP COLUMN "role";

-- No database object depends on the legacy enum after users.role is removed.
DROP TYPE "Role";
