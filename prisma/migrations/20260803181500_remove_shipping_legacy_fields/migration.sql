ALTER TABLE "branches"
  DROP COLUMN "ghn_province_id",
  DROP COLUMN "ghn_district_id",
  DROP COLUMN "ghn_ward_code",
  DROP COLUMN "ghn_mapping_verified_at",
  DROP COLUMN "ghn_shop_id";

ALTER TABLE "user_addresses"
  DROP COLUMN "ghn_province_id",
  DROP COLUMN "ghn_district_id",
  DROP COLUMN "ghn_ward_code",
  DROP COLUMN "ghn_mapping_verified_at";

ALTER TABLE "orders"
  DROP COLUMN "shipping_district_name",
  DROP COLUMN "shipping_ghn_province_id",
  DROP COLUMN "shipping_ghn_district_id",
  DROP COLUMN "shipping_ghn_ward_code",
  DROP COLUMN "shipping_ghn_mapping_verified_at",
  DROP COLUMN "shipping_provider_snapshot",
  DROP COLUMN "shipping_service_id",
  DROP COLUMN "shipping_service_type_id",
  DROP COLUMN "shipping_service_name";
