-- Preserve legacy district text in the existing free-form address fields
-- before removing the obsolete third administrative level.
UPDATE "branches"
SET "address" = concat_ws(', ', NULLIF(btrim("address"), ''), btrim("district"))
WHERE "district" IS NOT NULL
  AND btrim("district") <> ''
  AND strpos(lower(COALESCE("address", '')), lower(btrim("district"))) = 0;

UPDATE "user_addresses"
SET "detail" = concat_ws(', ', NULLIF(btrim("detail"), ''), btrim("district"))
WHERE "district" IS NOT NULL
  AND btrim("district") <> ''
  AND strpos(lower(COALESCE("detail", '')), lower(btrim("district"))) = 0;

ALTER TABLE "branches"
  DROP COLUMN "district";

ALTER TABLE "user_addresses"
  DROP COLUMN "district",
  DROP COLUMN "ghn_district_id";
