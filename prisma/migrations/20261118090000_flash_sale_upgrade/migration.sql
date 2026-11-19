-- CreateEnum
-- Forward-only: existing orders retain nullable snapshots.
CREATE TYPE "FlashSaleState" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'STOPPED_EARLY');

-- CreateEnum
CREATE TYPE "FlashSaleAllocationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');


-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "catalog_effective_price" DECIMAL(12,2),
ADD COLUMN     "flash_price" DECIMAL(12,0),
ADD COLUMN     "flash_sale_item_id" TEXT;

-- CreateTable
CREATE TABLE "flash_sales" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "state" "FlashSaleState" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "stopped_at" TIMESTAMP(3),
    "control_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "controlled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flash_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flash_sale_items" (
    "id" TEXT NOT NULL,
    "flash_sale_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "flash_price" DECIMAL(12,0) NOT NULL,
    "reference_price" DECIMAL(12,0) NOT NULL,
    "total_quota" INTEGER NOT NULL,
    "max_quantity_per_user" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flash_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flash_sale_allocations" (
    "id" TEXT NOT NULL,
    "flash_sale_item_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "FlashSaleAllocationStatus" NOT NULL,
    "expires_at" TIMESTAMP(3),
    "reserved_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),

    CONSTRAINT "flash_sale_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flash_sales_state_start_at_end_at_idx" ON "flash_sales"("state", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "flash_sale_items_variant_id_idx" ON "flash_sale_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "flash_sale_items_flash_sale_id_variant_id_key" ON "flash_sale_items"("flash_sale_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "flash_sale_allocations_order_item_id_key" ON "flash_sale_allocations"("order_item_id");

-- CreateIndex
CREATE INDEX "flash_sale_allocations_flash_sale_item_id_status_idx" ON "flash_sale_allocations"("flash_sale_item_id", "status");

-- CreateIndex
CREATE INDEX "flash_sale_allocations_flash_sale_item_id_user_id_status_idx" ON "flash_sale_allocations"("flash_sale_item_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "flash_sale_allocations_order_id_idx" ON "flash_sale_allocations"("order_id");

-- CreateIndex
CREATE INDEX "flash_sale_allocations_status_expires_at_idx" ON "flash_sale_allocations"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_flash_sale_item_id_fkey" FOREIGN KEY ("flash_sale_item_id") REFERENCES "flash_sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_sale_items" ADD CONSTRAINT "flash_sale_items_flash_sale_id_fkey" FOREIGN KEY ("flash_sale_id") REFERENCES "flash_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_sale_items" ADD CONSTRAINT "flash_sale_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_sale_allocations" ADD CONSTRAINT "flash_sale_allocations_flash_sale_item_id_fkey" FOREIGN KEY ("flash_sale_item_id") REFERENCES "flash_sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_sale_allocations" ADD CONSTRAINT "flash_sale_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_sale_allocations" ADD CONSTRAINT "flash_sale_allocations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flash_sale_allocations" ADD CONSTRAINT "flash_sale_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Financial and quota invariants are also enforced at the database boundary.
ALTER TABLE flash_sales ADD CONSTRAINT flash_sales_period_check CHECK (start_at < end_at);
ALTER TABLE flash_sale_items ADD CONSTRAINT flash_sale_items_price_check CHECK (flash_price > 0 AND flash_price < reference_price);
ALTER TABLE flash_sale_items ADD CONSTRAINT flash_sale_items_quota_check CHECK (total_quota > 0 AND max_quantity_per_user > 0 AND max_quantity_per_user <= total_quota);
ALTER TABLE flash_sale_allocations ADD CONSTRAINT flash_sale_allocations_quantity_check CHECK (quantity > 0);
ALTER TABLE flash_sale_allocations ADD CONSTRAINT flash_sale_allocations_deadline_check CHECK (status <> 'RESERVED' OR expires_at IS NOT NULL);
