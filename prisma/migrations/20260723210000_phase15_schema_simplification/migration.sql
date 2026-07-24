-- Phase 15 schema simplification.
-- Preflight confirmed that all four removed tables contain zero rows.

-- Remove the persisted checkout draft relationship from orders first.
ALTER TABLE "orders"
  DROP CONSTRAINT IF EXISTS "orders_checkout_draft_id_fkey";

DROP INDEX IF EXISTS "orders_checkout_draft_id_key";
DROP INDEX IF EXISTS "orders_checkout_draft_id_idx";

ALTER TABLE "orders"
  DROP COLUMN IF EXISTS "checkout_draft_id";

-- Checkout and stock lifecycle no longer use auxiliary business tables.
DROP TABLE IF EXISTS "inventory_movements";
DROP TABLE IF EXISTS "inventory_reservations";
DROP TABLE IF EXISTS "checkout_draft_items";
DROP TABLE IF EXISTS "checkout_drafts";

-- Product and order lines use the server-side GHN package profile.
ALTER TABLE "product_variants"
  DROP CONSTRAINT IF EXISTS "product_variants_shipping_weight_positive",
  DROP CONSTRAINT IF EXISTS "product_variants_shipping_length_positive",
  DROP CONSTRAINT IF EXISTS "product_variants_shipping_width_positive",
  DROP CONSTRAINT IF EXISTS "product_variants_shipping_height_positive",
  DROP COLUMN IF EXISTS "shipping_weight_grams",
  DROP COLUMN IF EXISTS "shipping_length_cm",
  DROP COLUMN IF EXISTS "shipping_width_cm",
  DROP COLUMN IF EXISTS "shipping_height_cm";

ALTER TABLE "order_items"
  DROP CONSTRAINT IF EXISTS "order_items_shipping_positive",
  DROP COLUMN IF EXISTS "shipping_weight_grams",
  DROP COLUMN IF EXISTS "shipping_length_cm",
  DROP COLUMN IF EXISTS "shipping_width_cm",
  DROP COLUMN IF EXISTS "shipping_height_cm",
  ADD COLUMN "source_cart_item_id" TEXT;

CREATE INDEX "order_items_source_cart_item_id_idx"
  ON "order_items"("source_cart_item_id");

-- A PaymentTransaction is the authoritative VNPAY stock-hold lifecycle.
ALTER TABLE "payment_transactions"
  ADD COLUMN "stock_reserved_at" TIMESTAMP(3),
  ADD COLUMN "stock_released_at" TIMESTAMP(3),
  ADD COLUMN "stock_consumed_at" TIMESTAMP(3);

DROP TYPE IF EXISTS "CheckoutDraftStatus";
DROP TYPE IF EXISTS "InventoryReservationStatus";
DROP TYPE IF EXISTS "InventoryMovementType";
