-- Phase 11 keeps the existing three Inventory tables and closes their contract gaps.
ALTER TABLE "stock_receipts"
ADD COLUMN "supplier_id" TEXT;

CREATE INDEX "stock_receipts_supplier_id_idx"
ON "stock_receipts"("supplier_id");

ALTER TABLE "stock_receipts"
ADD CONSTRAINT "stock_receipts_supplier_id_fkey"
FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "branch_product_stocks"
ADD CONSTRAINT "branch_product_stocks_threshold_nonnegative"
CHECK ("low_stock_threshold" >= 0);

ALTER TABLE "branch_product_stocks"
DROP CONSTRAINT "branch_product_stocks_variant_id_fkey",
ADD CONSTRAINT "branch_product_stocks_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Remove obsolete pre-Phase-11 permission definitions. New permissions are seeded
-- idempotently by prisma/catalog.seed.ts after migration deployment.
DELETE FROM "permissions"
WHERE "code" IN (
  'inventory.update',
  'stock_movements.read',
  'stock_movements.create'
);
