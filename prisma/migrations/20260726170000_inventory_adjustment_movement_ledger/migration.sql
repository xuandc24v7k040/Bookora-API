-- Inventory adjustment documents and immutable on-hand movement ledger.
CREATE TYPE "StockReceiptType" AS ENUM ('IMPORT', 'ADJUSTMENT');
CREATE TYPE "InventoryMovementType" AS ENUM (
  'MANUAL_ADJUSTMENT',
  'STOCK_RECEIPT_CONFIRMED',
  'ORDER_STOCK_DEDUCTED',
  'ORDER_STOCK_RESTORED'
);
CREATE TYPE "InventoryMovementSourceType" AS ENUM (
  'DIRECT_ADJUSTMENT',
  'STOCK_RECEIPT',
  'ORDER'
);

ALTER TABLE "stock_receipts"
ADD COLUMN "type" "StockReceiptType" NOT NULL DEFAULT 'IMPORT';

-- Existing rows are authoritative import receipts. The explicit update documents
-- the backfill policy even though the NOT NULL default already fills the column.
UPDATE "stock_receipts" SET "type" = 'IMPORT' WHERE "type" IS NULL;

ALTER TABLE "stock_receipt_items"
DROP CONSTRAINT "stock_receipt_items_quantity_positive",
ADD CONSTRAINT "stock_receipt_items_quantity_nonzero" CHECK ("quantity" <> 0);

CREATE TABLE "inventory_movements" (
  "id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "variant_id" TEXT NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "quantity_change" INTEGER NOT NULL,
  "before_quantity" INTEGER NOT NULL,
  "after_quantity" INTEGER NOT NULL,
  "reason" TEXT,
  "source_type" "InventoryMovementSourceType" NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_code" TEXT,
  "actor_id" TEXT,
  "receipt_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_movements_quantity_change_nonzero" CHECK ("quantity_change" <> 0),
  CONSTRAINT "inventory_movements_before_nonnegative" CHECK ("before_quantity" >= 0),
  CONSTRAINT "inventory_movements_after_nonnegative" CHECK ("after_quantity" >= 0),
  CONSTRAINT "inventory_movements_quantity_equation" CHECK ("after_quantity" = "before_quantity" + "quantity_change")
);

CREATE UNIQUE INDEX "inventory_movements_source_type_source_id_variant_id_type_key"
ON "inventory_movements"("source_type", "source_id", "variant_id", "type");
CREATE INDEX "inventory_movements_branch_id_created_at_idx" ON "inventory_movements"("branch_id", "created_at");
CREATE INDEX "inventory_movements_branch_id_type_created_at_idx" ON "inventory_movements"("branch_id", "type", "created_at");
CREATE INDEX "inventory_movements_variant_id_created_at_idx" ON "inventory_movements"("variant_id", "created_at");
CREATE INDEX "inventory_movements_source_type_source_id_idx" ON "inventory_movements"("source_type", "source_id");
CREATE INDEX "inventory_movements_actor_id_idx" ON "inventory_movements"("actor_id");
CREATE INDEX "inventory_movements_receipt_id_idx" ON "inventory_movements"("receipt_id");

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branch_id_fkey"
FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_fkey"
FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_receipt_id_fkey"
FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
