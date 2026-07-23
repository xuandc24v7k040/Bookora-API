ALTER TABLE "users"
  ADD COLUMN "avatar_url" TEXT;

ALTER TABLE "user_addresses"
  ADD COLUMN "label" TEXT;

ALTER TABLE "user_addresses"
  RENAME COLUMN "ghn_province_id" TO "province_code";

ALTER TABLE "user_addresses"
  RENAME COLUMN "ghn_ward_code" TO "ward_code";

-- Existing rows may predate the two-level authoritative provider codes.
-- The current source database has no user-address rows; this guard keeps the
-- forward migration explicit if another environment contains legacy data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user_addresses"
    WHERE "province_code" IS NULL OR "ward_code" IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy user addresses require province/ward code backfill before Phase 11.5';
  END IF;
END $$;

ALTER TABLE "user_addresses"
  ALTER COLUMN "province_code" SET NOT NULL,
  ALTER COLUMN "ward_code" TYPE INTEGER USING "ward_code"::INTEGER,
  ALTER COLUMN "ward_code" SET NOT NULL;

CREATE INDEX "user_addresses_user_id_is_default_idx"
  ON "user_addresses"("user_id", "is_default");

CREATE UNIQUE INDEX "user_addresses_one_default_per_user"
  ON "user_addresses"("user_id")
  WHERE "is_default" = TRUE;
