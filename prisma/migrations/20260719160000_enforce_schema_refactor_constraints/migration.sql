-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_variant_id_fkey";

-- Replace legacy indexes with target indexes.
DROP INDEX "product_media_is_primary_sort_order_idx";
DROP INDEX "product_media_product_id_idx";
DROP INDEX "product_media_variant_id_idx";
DROP INDEX "product_options_code_key";

-- Required fields are safe only after verified backfill.
ALTER TABLE "order_items" ALTER COLUMN "variant_id" SET NOT NULL;
ALTER TABLE "product_options" ALTER COLUMN "product_id" SET NOT NULL;
ALTER TABLE "product_variant_option_values" ALTER COLUMN "option_id" SET NOT NULL;
ALTER TABLE "product_variants" ALTER COLUMN "combination_key" SET NOT NULL,
ALTER COLUMN "original_price" SET NOT NULL;

-- Target uniqueness and lookup indexes.
CREATE INDEX "product_media_product_id_sort_order_idx" ON "product_media"("product_id", "sort_order");
CREATE INDEX "product_media_variant_id_sort_order_idx" ON "product_media"("variant_id", "sort_order");
CREATE UNIQUE INDEX "product_options_product_id_code_key" ON "product_options"("product_id", "code");
CREATE UNIQUE INDEX "product_variant_option_values_variant_id_option_id_key" ON "product_variant_option_values"("variant_id", "option_id");
CREATE UNIQUE INDEX "product_variants_product_id_combination_key_key" ON "product_variants"("product_id", "combination_key");

-- One primary item per product or variant gallery.
CREATE UNIQUE INDEX "product_media_one_primary_per_variant"
ON "product_media" ("variant_id")
WHERE "is_primary" = TRUE AND "variant_id" IS NOT NULL;

CREATE UNIQUE INDEX "product_media_one_primary_general_per_product"
ON "product_media" ("product_id")
WHERE "is_primary" = TRUE AND "variant_id" IS NULL;

-- Data-layer business constraints.
ALTER TABLE "branch_product_stocks"
ADD CONSTRAINT "branch_product_stocks_quantity_nonnegative"
CHECK ("quantity" >= 0);

ALTER TABLE "stock_receipt_items"
ADD CONSTRAINT "stock_receipt_items_quantity_positive"
CHECK ("quantity" > 0),
ADD CONSTRAINT "stock_receipt_items_cost_nonnegative"
CHECK ("cost_price" IS NULL OR "cost_price" >= 0);

ALTER TABLE "stock_receipts"
ADD CONSTRAINT "stock_receipts_confirmation_state_valid"
CHECK (
  ("status" = 'CONFIRMED' AND "confirmed_at" IS NOT NULL)
  OR
  ("status" <> 'CONFIRMED' AND "confirmed_at" IS NULL AND "confirmed_by_id" IS NULL)
);

ALTER TABLE "product_variants"
ADD CONSTRAINT "product_variants_prices_nonnegative"
CHECK (
  "original_price" >= 0
  AND ("sale_price" IS NULL OR ("sale_price" >= 0 AND "sale_price" <= "original_price"))
),
ADD CONSTRAINT "product_variants_sale_window_valid"
CHECK (
  "sale_start_at" IS NULL
  OR "sale_end_at" IS NULL
  OR "sale_start_at" < "sale_end_at"
);

ALTER TABLE "cart_items"
ADD CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "order_items"
ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
ADD CONSTRAINT "order_items_prices_nonnegative"
CHECK ("unit_price" >= 0 AND "total_price" >= 0);

-- Required Variant history cannot be nulled by deleting a Variant.
ALTER TABLE "order_items"
ADD CONSTRAINT "order_items_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
