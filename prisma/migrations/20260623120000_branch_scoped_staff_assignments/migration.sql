-- Branch-scoped staff authorization.
-- Keep global user_roles/user_permissions for SYSTEM and CUSTOMER users only.

DO $$
DECLARE
    invalid_count INTEGER;
    sample_user_ids TEXT;
BEGIN
    WITH invalid_users AS (
        SELECT DISTINCT u."id"
        FROM "users" u
        LEFT JOIN "user_branches" ub ON ub."user_id" = u."id"
        LEFT JOIN "branches" b ON b."id" = ub."branch_id"
        WHERE (
            u."type" = 'BRANCH'::"UserType"
            AND (
                NOT EXISTS (
                    SELECT 1
                    FROM "user_branches" active_ub
                    JOIN "branches" active_b ON active_b."id" = active_ub."branch_id"
                    WHERE active_ub."user_id" = u."id"
                      AND active_ub."is_active" = true
                      AND active_b."is_active" = true
                )
                OR (ub."is_active" = true AND (b."id" IS NULL OR b."is_active" = false))
                OR (ub."is_primary" = true AND (ub."is_active" = false OR b."is_active" = false))
                OR (
                    SELECT COUNT(*)
                    FROM "user_branches" primary_ub
                    WHERE primary_ub."user_id" = u."id"
                      AND primary_ub."is_primary" = true
                      AND primary_ub."is_active" = true
                ) <> 1
                OR EXISTS (
                    SELECT 1
                    FROM "user_roles" ur
                    JOIN "roles" r ON r."id" = ur."role_id"
                    WHERE ur."user_id" = u."id"
                      AND (r."type" <> 'BRANCH'::"UserType" OR r."is_active" = false)
                )
            )
        )
        OR (
            u."type" IN ('SYSTEM'::"UserType", 'CUSTOMER'::"UserType")
            AND ub."user_id" IS NOT NULL
        )
    ),
    sample_users AS (
        SELECT "id" FROM invalid_users ORDER BY "id" LIMIT 10
    )
    SELECT
        (SELECT COUNT(*) FROM invalid_users),
        (SELECT STRING_AGG("id", ', ' ORDER BY "id") FROM sample_users)
    INTO invalid_count, sample_user_ids;

    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Branch-scoped staff authorization migration preflight failed for % users. Sample user IDs: %',
            invalid_count,
            sample_user_ids;
    END IF;
END $$;

ALTER TABLE "user_branches"
ADD COLUMN "id" TEXT;

UPDATE "user_branches"
SET "id" = '0' || upper(substr(md5(random()::text || clock_timestamp()::text || "user_id" || "branch_id"), 1, 25))
WHERE "id" IS NULL;

ALTER TABLE "user_branches"
ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "user_branches"
ADD CONSTRAINT "user_branches_pkey" PRIMARY KEY ("id");

CREATE TABLE "user_branch_roles" (
    "id" TEXT NOT NULL,
    "user_branch_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_by" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branch_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_branch_permissions" (
    "id" TEXT NOT NULL,
    "user_branch_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "assigned_by" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branch_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_branch_roles_user_branch_id_role_id_key" ON "user_branch_roles"("user_branch_id", "role_id");
CREATE INDEX "user_branch_roles_user_branch_id_idx" ON "user_branch_roles"("user_branch_id");
CREATE INDEX "user_branch_roles_role_id_idx" ON "user_branch_roles"("role_id");
CREATE INDEX "user_branch_roles_assigned_by_idx" ON "user_branch_roles"("assigned_by");
CREATE UNIQUE INDEX "user_branch_permissions_user_branch_id_permission_id_key" ON "user_branch_permissions"("user_branch_id", "permission_id");
CREATE INDEX "user_branch_permissions_user_branch_id_idx" ON "user_branch_permissions"("user_branch_id");
CREATE INDEX "user_branch_permissions_permission_id_idx" ON "user_branch_permissions"("permission_id");
CREATE INDEX "user_branch_permissions_assigned_by_idx" ON "user_branch_permissions"("assigned_by");

ALTER TABLE "user_branch_roles" ADD CONSTRAINT "user_branch_roles_user_branch_id_fkey" FOREIGN KEY ("user_branch_id") REFERENCES "user_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_branch_roles" ADD CONSTRAINT "user_branch_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_branch_roles" ADD CONSTRAINT "user_branch_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_branch_permissions" ADD CONSTRAINT "user_branch_permissions_user_branch_id_fkey" FOREIGN KEY ("user_branch_id") REFERENCES "user_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_branch_permissions" ADD CONSTRAINT "user_branch_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_branch_permissions" ADD CONSTRAINT "user_branch_permissions_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_branches"
ADD CONSTRAINT "user_branches_primary_must_be_active_check"
CHECK (NOT "is_primary" OR "is_active");

CREATE UNIQUE INDEX "user_branches_one_active_primary_per_user_idx"
ON "user_branches"("user_id")
WHERE "is_primary" = true AND "is_active" = true;

DO $$
DECLARE
    invalid_count INTEGER;
    sample_user_ids TEXT;
BEGIN
    WITH branch_users AS (
        SELECT u."id"
        FROM "users" u
        WHERE u."type" = 'BRANCH'::"UserType"
    ),
    active_branch_counts AS (
        SELECT
            bu."id" AS "user_id",
            COUNT(ub."id") FILTER (WHERE ub."is_active" = true AND b."is_active" = true) AS active_count
        FROM branch_users bu
        LEFT JOIN "user_branches" ub ON ub."user_id" = bu."id"
        LEFT JOIN "branches" b ON b."id" = ub."branch_id"
        GROUP BY bu."id"
    ),
    invalid_users AS (
        SELECT abc."user_id"
        FROM active_branch_counts abc
        WHERE abc.active_count = 0
           OR EXISTS (
                SELECT 1
                FROM "user_branches" ub
                LEFT JOIN "branches" b ON b."id" = ub."branch_id"
                WHERE ub."user_id" = abc."user_id"
                  AND ub."is_active" = true
                  AND (b."id" IS NULL OR b."is_active" = false)
           )
           OR (
                abc.active_count > 1
                AND (
                    EXISTS (
                        SELECT 1
                        FROM "user_roles" ur
                        JOIN "roles" r ON r."id" = ur."role_id"
                        WHERE ur."user_id" = abc."user_id"
                          AND r."type" = 'BRANCH'::"UserType"
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM "user_permissions" up
                        WHERE up."user_id" = abc."user_id"
                    )
                )
           )
    ),
    sample_users AS (
        SELECT "user_id"
        FROM invalid_users
        ORDER BY "user_id"
        LIMIT 10
    )
    SELECT
        (SELECT COUNT(*) FROM invalid_users),
        (SELECT STRING_AGG("user_id", ', ' ORDER BY "user_id") FROM sample_users)
    INTO invalid_count, sample_user_ids;

    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Branch-scoped staff authorization migration aborted: % BRANCH users need manual branch auth mapping or branch cleanup. Sample user IDs: %',
            invalid_count,
            sample_user_ids;
    END IF;
END $$;

DO $$
DECLARE
    invalid_count INTEGER;
    sample_user_ids TEXT;
BEGIN
    WITH invalid_users AS (
        SELECT DISTINCT u."id"
        FROM "users" u
        JOIN "user_branches" ub ON ub."user_id" = u."id"
        WHERE u."type" IN ('SYSTEM'::"UserType", 'CUSTOMER'::"UserType")
    ),
    sample_users AS (
        SELECT "id"
        FROM invalid_users
        ORDER BY "id"
        LIMIT 10
    )
    SELECT
        (SELECT COUNT(*) FROM invalid_users),
        (SELECT STRING_AGG("id", ', ' ORDER BY "id") FROM sample_users)
    INTO invalid_count, sample_user_ids;

    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Branch-scoped staff authorization migration aborted: % SYSTEM/CUSTOMER users have branch assignments. Sample user IDs: %',
            invalid_count,
            sample_user_ids;
    END IF;
END $$;

WITH single_branch_users AS (
    SELECT u."id" AS "user_id", MIN(ub."id") AS "user_branch_id"
    FROM "users" u
    JOIN "user_branches" ub ON ub."user_id" = u."id"
    JOIN "branches" b ON b."id" = ub."branch_id"
    WHERE u."type" = 'BRANCH'::"UserType"
      AND ub."is_active" = true
      AND b."is_active" = true
    GROUP BY u."id"
    HAVING COUNT(*) = 1
)
INSERT INTO "user_branch_roles" ("id", "user_branch_id", "role_id", "assigned_by", "assigned_at")
SELECT
    '0' || upper(substr(md5(random()::text || clock_timestamp()::text || ur."user_id" || ur."role_id"), 1, 25)),
    sbu."user_branch_id",
    ur."role_id",
    ur."assigned_by",
    ur."assigned_at"
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."role_id"
JOIN single_branch_users sbu ON sbu."user_id" = ur."user_id"
WHERE r."type" = 'BRANCH'::"UserType"
  AND r."is_active" = true
ON CONFLICT ("user_branch_id", "role_id") DO NOTHING;

WITH single_branch_users AS (
    SELECT u."id" AS "user_id", MIN(ub."id") AS "user_branch_id"
    FROM "users" u
    JOIN "user_branches" ub ON ub."user_id" = u."id"
    JOIN "branches" b ON b."id" = ub."branch_id"
    WHERE u."type" = 'BRANCH'::"UserType"
      AND ub."is_active" = true
      AND b."is_active" = true
    GROUP BY u."id"
    HAVING COUNT(*) = 1
)
INSERT INTO "user_branch_permissions" ("id", "user_branch_id", "permission_id", "effect", "assigned_by", "assigned_at")
SELECT
    '0' || upper(substr(md5(random()::text || clock_timestamp()::text || up."user_id" || up."permission_id"), 1, 25)),
    sbu."user_branch_id",
    up."permission_id",
    up."effect",
    up."assigned_by",
    up."assigned_at"
FROM "user_permissions" up
JOIN single_branch_users sbu ON sbu."user_id" = up."user_id"
ON CONFLICT ("user_branch_id", "permission_id") DO NOTHING;

DELETE FROM "user_roles" ur
USING "users" u, "roles" r
WHERE ur."user_id" = u."id"
  AND ur."role_id" = r."id"
  AND u."type" = 'BRANCH'::"UserType"
  AND r."type" = 'BRANCH'::"UserType";

DELETE FROM "user_permissions" up
USING "users" u
WHERE up."user_id" = u."id"
  AND u."type" = 'BRANCH'::"UserType";
