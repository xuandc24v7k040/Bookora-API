-- CreateEnum
CREATE TYPE "StockReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "stock_deducted_at" TIMESTAMP(3),
ADD COLUMN "stock_restored_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "product_media" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN "variant_id" TEXT;

-- AlterTable
ALTER TABLE "product_options" ADD COLUMN "product_id" TEXT;

-- AlterTable
ALTER TABLE "product_variant_option_values" ADD COLUMN "option_id" TEXT;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "combination_key" TEXT,
ADD COLUMN "isbn" TEXT,
ADD COLUMN "original_price" DECIMAL(15,2),
ADD COLUMN "package_size" TEXT,
ADD COLUMN "page_count" INTEGER,
ADD COLUMN "publication_year" INTEGER,
ADD COLUMN "sale_end_at" TIMESTAMP(3),
ADD COLUMN "sale_price" DECIMAL(15,2),
ADD COLUMN "sale_start_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "replied_at" TIMESTAMP(3),
ADD COLUMN "replied_by_id" TEXT,
ADD COLUMN "reply_content" TEXT;

-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "StockReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "created_by_id" TEXT,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipt_items" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cost_price" DECIMAL(15,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stock_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_code_key" ON "stock_receipts"("code");
CREATE INDEX "stock_receipts_branch_id_status_idx" ON "stock_receipts"("branch_id", "status");
CREATE INDEX "stock_receipts_created_by_id_idx" ON "stock_receipts"("created_by_id");
CREATE INDEX "stock_receipts_confirmed_by_id_idx" ON "stock_receipts"("confirmed_by_id");
CREATE INDEX "stock_receipts_created_at_idx" ON "stock_receipts"("created_at");
CREATE INDEX "stock_receipt_items_variant_id_idx" ON "stock_receipt_items"("variant_id");
CREATE UNIQUE INDEX "stock_receipt_items_receipt_id_variant_id_key" ON "stock_receipt_items"("receipt_id", "variant_id");
CREATE INDEX "product_media_variant_id_idx" ON "product_media"("variant_id");
CREATE INDEX "product_options_product_id_sort_order_idx" ON "product_options"("product_id", "sort_order");
CREATE INDEX "product_variant_option_values_option_id_idx" ON "product_variant_option_values"("option_id");
CREATE INDEX "reviews_replied_by_id_idx" ON "reviews"("replied_by_id");

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_replied_by_id_fkey" FOREIGN KEY ("replied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
