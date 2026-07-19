-- Destructive cleanup is intentionally isolated from additive/constraint work.
-- Abort if any approved preflight/backfill invariant is no longer true.
DO $$
DECLARE
  legacy_table text;
  has_rows boolean;
BEGIN
  FOREACH legacy_table IN ARRAY ARRAY[
    'mega_menus', 'mega_menu_columns', 'mega_menu_sections', 'mega_menu_items',
    'filter_definitions', 'filter_options', 'category_filter_sets',
    'stock_movements', 'stock_transfers', 'stock_transfer_items',
    'coupon_branches', 'coupon_products', 'coupon_categories', 'coupon_usages',
    'payment_transactions', 'order_shipments', 'order_status_histories',
    'notifications', 'related_products', 'combos', 'combo_items', 'combo_branches',
    'book_series', 'book_series_items', 'preorders', 'book_previews',
    'book_preview_pages', 'audit_logs'
  ]
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', legacy_table)
      INTO has_rows;
    IF has_rows THEN
      RAISE EXCEPTION 'Schema refactor blocked: legacy table % is not empty', legacy_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM branch_product_stocks WHERE reserved_quantity <> 0
  ) THEN
    RAISE EXCEPTION 'Schema refactor blocked: reserved stock remains';
  END IF;

  IF EXISTS (SELECT 1 FROM products WHERE status = 'PREORDER') THEN
    RAISE EXCEPTION 'Schema refactor blocked: PREORDER products remain';
  END IF;

  IF EXISTS (SELECT 1 FROM coupons WHERE discount_type = 'FREE_SHIPPING') THEN
    RAISE EXCEPTION 'Schema refactor blocked: FREE_SHIPPING coupons remain';
  END IF;

  IF EXISTS (
    SELECT 1 FROM order_items
    WHERE combo_id IS NOT NULL OR item_type <> 'PRODUCT'
  ) THEN
    RAISE EXCEPTION 'Schema refactor blocked: combo OrderItems remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM branch_product_prices price
    JOIN product_variants variant ON variant.id = price.variant_id
    WHERE price.is_active
      AND (
        variant.original_price IS DISTINCT FROM price.original_price
        OR variant.sale_price IS DISTINCT FROM price.sale_price
        OR variant.sale_start_at IS DISTINCT FROM price.sale_start_at
        OR variant.sale_end_at IS DISTINCT FROM price.sale_end_at
      )
  ) THEN
    RAISE EXCEPTION 'Schema refactor blocked: branch price backfill mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM product_variant_media source
    JOIN product_variants variant ON variant.id = source.variant_id
    LEFT JOIN product_media target ON target.id = source.id
    WHERE target.id IS NULL
      OR target.product_id IS DISTINCT FROM variant.product_id
      OR target.variant_id IS DISTINCT FROM source.variant_id
      OR target.url IS DISTINCT FROM source.url
      OR target.alt_text IS DISTINCT FROM source.alt_text
      OR target.sort_order IS DISTINCT FROM source.sort_order
      OR target.is_primary IS DISTINCT FROM source.is_primary
  ) THEN
    RAISE EXCEPTION 'Schema refactor blocked: variant media backfill mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM review_replies source
    JOIN reviews target ON target.id = source.review_id
    WHERE target.reply_content IS DISTINCT FROM source.content
      OR target.replied_by_id IS DISTINCT FROM source.admin_id
      OR target.replied_at IS DISTINCT FROM source.created_at
  ) THEN
    RAISE EXCEPTION 'Schema refactor blocked: review reply backfill mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM product_variants variant
    JOIN products product ON product.id = variant.product_id
    WHERE (product.isbn IS NOT NULL AND variant.isbn IS NULL)
       OR (product.publication_year IS NOT NULL AND variant.publication_year IS NULL)
       OR (product.page_count IS NOT NULL AND variant.page_count IS NULL)
       OR (product.weight_gram IS NOT NULL AND variant.weight_gram IS NULL)
       OR (product.package_size IS NOT NULL AND variant.package_size IS NULL)
  ) THEN
    RAISE EXCEPTION 'Schema refactor blocked: Product field backfill incomplete';
  END IF;
END $$;

-- Remove obsolete enum values only after their data checks pass.
BEGIN;
CREATE TYPE "DiscountType_new" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
ALTER TABLE "coupons" ALTER COLUMN "discount_type" TYPE "DiscountType_new"
USING ("discount_type"::text::"DiscountType_new");
ALTER TYPE "DiscountType" RENAME TO "DiscountType_old";
ALTER TYPE "DiscountType_new" RENAME TO "DiscountType";
DROP TYPE "DiscountType_old";
COMMIT;

BEGIN;
CREATE TYPE "ProductStatus_new" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'DISCONTINUED');
ALTER TABLE "products" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "status" TYPE "ProductStatus_new"
USING ("status"::text::"ProductStatus_new");
ALTER TYPE "ProductStatus" RENAME TO "ProductStatus_old";
ALTER TYPE "ProductStatus_new" RENAME TO "ProductStatus";
DROP TYPE "ProductStatus_old";
ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- Remove retained-table fields whose data has been verified/backfilled.
ALTER TABLE "branch_product_stocks" DROP COLUMN "reserved_quantity";

ALTER TABLE "coupons"
DROP COLUMN "scope",
DROP COLUMN "usage_limit_per_user",
DROP COLUMN "used_count";

ALTER TABLE "order_items" DROP CONSTRAINT "order_items_combo_id_fkey";
ALTER TABLE "order_items"
DROP COLUMN "combo_id",
DROP COLUMN "item_type";

ALTER TABLE "product_variants" DROP COLUMN "image_url";

ALTER TABLE "products"
DROP COLUMN "cover_type",
DROP COLUMN "isbn",
DROP COLUMN "package_size",
DROP COLUMN "page_count",
DROP COLUMN "publication_year",
DROP COLUMN "weight_gram";

-- Drop child tables before their legacy parents.
DROP TABLE "mega_menu_items";
DROP TABLE "mega_menu_sections";
DROP TABLE "mega_menu_columns";
DROP TABLE "mega_menus";

DROP TABLE "category_filter_sets";
DROP TABLE "filter_options";
DROP TABLE "filter_definitions";

DROP TABLE "product_variant_media";
DROP TABLE "branch_product_prices";
DROP TABLE "stock_movements";
DROP TABLE "stock_transfer_items";
DROP TABLE "stock_transfers";

DROP TABLE "coupon_branches";
DROP TABLE "coupon_products";
DROP TABLE "coupon_categories";
DROP TABLE "coupon_usages";

DROP TABLE "payment_transactions";
DROP TABLE "order_shipments";
DROP TABLE "order_status_histories";
DROP TABLE "review_replies";
DROP TABLE "notifications";

DROP TABLE "related_products";
DROP TABLE "combo_branches";
DROP TABLE "combo_items";
DROP TABLE "combos";
DROP TABLE "book_series_items";
DROP TABLE "book_series";
DROP TABLE "preorders";
DROP TABLE "book_preview_pages";
DROP TABLE "book_previews";
DROP TABLE "audit_logs";

-- Remove enums with no remaining model/column references.
DROP TYPE "AuditAction";
DROP TYPE "AuditTargetType";
DROP TYPE "CouponScope";
DROP TYPE "CouponTargetType";
DROP TYPE "FilterSource";
DROP TYPE "FilterType";
DROP TYPE "MegaMenuItemType";
DROP TYPE "NotificationType";
DROP TYPE "OrderItemType";
DROP TYPE "PaymentTransactionStatus";
DROP TYPE "PaymentTransactionType";
DROP TYPE "PreorderStatus";
DROP TYPE "StockMovementType";
DROP TYPE "StockTransferItemStatus";
DROP TYPE "StockTransferStatus";

-- Final target lookup indexes.
CREATE INDEX "branch_product_stocks_branch_id_quantity_idx"
ON "branch_product_stocks"("branch_id", "quantity");

DROP INDEX "product_option_values_option_id_idx";
CREATE INDEX "product_option_values_option_id_sort_order_idx"
ON "product_option_values"("option_id", "sort_order");

DROP INDEX "product_variant_option_values_variant_id_idx";
