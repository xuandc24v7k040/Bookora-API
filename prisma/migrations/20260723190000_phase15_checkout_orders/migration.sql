-- CreateEnum
CREATE TYPE "CheckoutDraftStatus" AS ENUM ('ACTIVE', 'INVALIDATED', 'EXPIRED', 'PAYMENT_PENDING', 'CONSUMED');

-- CreateEnum
CREATE TYPE "DeliveryAddressSource" AS ENUM ('SAVED_ADDRESS', 'CURRENT_LOCATION');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('VNPAY');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('ORDER_DEDUCTION', 'RESERVATION_CREATED', 'RESERVATION_CONSUMED', 'RESERVATION_RELEASED', 'ORDER_RESTORATION');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_FAILED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'UNPAID';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_variant_id_fkey";

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "ghn_district_id" INTEGER,
ADD COLUMN     "ghn_mapping_verified_at" TIMESTAMP(3),
ADD COLUMN     "ghn_province_id" INTEGER,
ADD COLUMN     "ghn_shop_id" INTEGER,
ADD COLUMN     "ghn_ward_code" TEXT;

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "name",
DROP COLUMN "total_price",
ADD COLUMN     "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "line_total" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "original_price" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "product_id" TEXT,
ADD COLUMN     "product_name" TEXT NOT NULL,
ADD COLUMN     "product_slug" TEXT NOT NULL,
ADD COLUMN     "shipping_height_cm" INTEGER NOT NULL,
ADD COLUMN     "shipping_length_cm" INTEGER NOT NULL,
ADD COLUMN     "shipping_weight_grams" INTEGER NOT NULL,
ADD COLUMN     "shipping_width_cm" INTEGER NOT NULL,
ADD COLUMN     "variant_label" TEXT NOT NULL,
ADD COLUMN     "variant_options" JSONB NOT NULL,
ALTER COLUMN "variant_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "branch_address_snapshot" TEXT NOT NULL,
ADD COLUMN     "branch_name_snapshot" TEXT NOT NULL,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "checkout_draft_id" TEXT,
ADD COLUMN     "delivery_address_source" "DeliveryAddressSource" NOT NULL,
ADD COLUMN     "estimated_delivery_at" TIMESTAMP(3),
ADD COLUMN     "idempotency_key" TEXT NOT NULL,
ADD COLUMN     "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "shipping_address_line" TEXT NOT NULL,
ADD COLUMN     "shipping_district_name" TEXT NOT NULL,
ADD COLUMN     "shipping_fee_breakdown_snapshot" JSONB NOT NULL,
ADD COLUMN     "shipping_ghn_district_id" INTEGER NOT NULL,
ADD COLUMN     "shipping_ghn_mapping_verified_at" TIMESTAMP(3),
ADD COLUMN     "shipping_ghn_province_id" INTEGER NOT NULL,
ADD COLUMN     "shipping_ghn_ward_code" TEXT NOT NULL,
ADD COLUMN     "shipping_latitude" DECIMAL(10,7),
ADD COLUMN     "shipping_location_accuracy_meters" INTEGER,
ADD COLUMN     "shipping_location_place_id" TEXT,
ADD COLUMN     "shipping_location_provider" TEXT,
ADD COLUMN     "shipping_longitude" DECIMAL(10,7),
ADD COLUMN     "shipping_provider_snapshot" TEXT NOT NULL,
ADD COLUMN     "shipping_province_name" TEXT NOT NULL,
ADD COLUMN     "shipping_quote_reference" TEXT NOT NULL,
ADD COLUMN     "shipping_service_id" INTEGER NOT NULL,
ADD COLUMN     "shipping_service_name" TEXT NOT NULL,
ADD COLUMN     "shipping_service_type_id" INTEGER NOT NULL,
ADD COLUMN     "shipping_ward_name" TEXT NOT NULL,
ADD COLUMN     "source_customer_address_id" TEXT,
ALTER COLUMN "shipping_fee" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'VND';

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "shipping_height_cm" INTEGER,
ADD COLUMN     "shipping_length_cm" INTEGER,
ADD COLUMN     "shipping_weight_grams" INTEGER,
ADD COLUMN     "shipping_width_cm" INTEGER;

-- AlterTable
ALTER TABLE "user_addresses" ADD COLUMN     "ghn_district_id" INTEGER,
ADD COLUMN     "ghn_mapping_verified_at" TIMESTAMP(3),
ADD COLUMN     "ghn_province_id" INTEGER,
ADD COLUMN     "ghn_ward_code" TEXT;

-- CreateTable
CREATE TABLE "checkout_drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "cart_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "status" "CheckoutDraftStatus" NOT NULL DEFAULT 'ACTIVE',
    "preview_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "delivery_address_source" "DeliveryAddressSource",
    "source_customer_address_id" TEXT,
    "receiver_name" TEXT,
    "receiver_phone" TEXT,
    "shipping_address" TEXT,
    "shipping_address_line" TEXT,
    "shipping_province_name" TEXT,
    "shipping_district_name" TEXT,
    "shipping_ward_name" TEXT,
    "shipping_ghn_province_id" INTEGER,
    "shipping_ghn_district_id" INTEGER,
    "shipping_ghn_ward_code" TEXT,
    "shipping_ghn_mapping_verified_at" TIMESTAMP(3),
    "shipping_latitude" DECIMAL(10,7),
    "shipping_longitude" DECIMAL(10,7),
    "shipping_location_accuracy_meters" INTEGER,
    "shipping_location_provider" TEXT,
    "shipping_location_place_id" TEXT,
    "payment_method" "PaymentMethod",
    "shipping_provider" TEXT,
    "shipping_service_id" INTEGER,
    "shipping_service_type_id" INTEGER,
    "shipping_service_name" TEXT,
    "shipping_fee" DECIMAL(12,2),
    "shipping_fee_breakdown" JSONB,
    "shipping_quote_reference" TEXT,
    "shipping_quoted_at" TIMESTAMP(3),
    "shipping_quote_expires_at" TIMESTAMP(3),
    "estimated_delivery_at" TIMESTAMP(3),
    "subtotal_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_draft_items" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "cart_item_id" TEXT,
    "variant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_slug" TEXT NOT NULL,
    "variant_label" TEXT NOT NULL,
    "variant_options" JSONB NOT NULL,
    "image_url" TEXT,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "original_price" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(12,2) NOT NULL,
    "shipping_weight_grams" INTEGER NOT NULL,
    "shipping_length_cm" INTEGER NOT NULL,
    "shipping_width_cm" INTEGER NOT NULL,
    "shipping_height_cm" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_draft_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'VNPAY',
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "idempotency_key" TEXT NOT NULL,
    "merchant_txn_ref" TEXT NOT NULL,
    "provider_transaction_no" TEXT,
    "bank_code" TEXT,
    "card_type" TEXT,
    "response_code" TEXT,
    "transaction_status" TEXT,
    "secure_hash_verified" BOOLEAN NOT NULL DEFAULT false,
    "request_payload_sanitized" JSONB,
    "callback_payload_sanitized" JSONB,
    "expires_at" TIMESTAMP(3),
    "pay_date" TIMESTAMP(3),
    "callback_received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_transaction_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "reservation_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_drafts_preview_key_key" ON "checkout_drafts"("preview_key");

-- CreateIndex
CREATE INDEX "checkout_drafts_user_id_status_idx" ON "checkout_drafts"("user_id", "status");

-- CreateIndex
CREATE INDEX "checkout_drafts_cart_id_idx" ON "checkout_drafts"("cart_id");

-- CreateIndex
CREATE INDEX "checkout_drafts_branch_id_idx" ON "checkout_drafts"("branch_id");

-- CreateIndex
CREATE INDEX "checkout_drafts_expires_at_idx" ON "checkout_drafts"("expires_at");

-- CreateIndex
CREATE INDEX "checkout_draft_items_draft_id_idx" ON "checkout_draft_items"("draft_id");

-- CreateIndex
CREATE INDEX "checkout_draft_items_cart_item_id_idx" ON "checkout_draft_items"("cart_item_id");

-- CreateIndex
CREATE INDEX "checkout_draft_items_variant_id_idx" ON "checkout_draft_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_draft_items_draft_id_variant_id_key" ON "checkout_draft_items"("draft_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_idempotency_key_key" ON "payment_transactions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_merchant_txn_ref_key" ON "payment_transactions"("merchant_txn_ref");

-- CreateIndex
CREATE INDEX "payment_transactions_payment_id_status_idx" ON "payment_transactions"("payment_id", "status");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_expires_at_idx" ON "payment_transactions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_provider_transaction_no_key" ON "payment_transactions"("provider", "provider_transaction_no");

-- CreateIndex
CREATE INDEX "inventory_reservations_order_id_status_idx" ON "inventory_reservations"("order_id", "status");

-- CreateIndex
CREATE INDEX "inventory_reservations_branch_id_variant_id_status_idx" ON "inventory_reservations"("branch_id", "variant_id", "status");

-- CreateIndex
CREATE INDEX "inventory_reservations_expires_at_status_idx" ON "inventory_reservations"("expires_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_reservations_payment_transaction_id_variant_id_key" ON "inventory_reservations"("payment_transaction_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_idempotency_key_key" ON "inventory_movements"("idempotency_key");

-- CreateIndex
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");

-- CreateIndex
CREATE INDEX "inventory_movements_branch_id_variant_id_idx" ON "inventory_movements"("branch_id", "variant_id");

-- CreateIndex
CREATE INDEX "inventory_movements_reservation_id_idx" ON "inventory_movements"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_checkout_draft_id_key" ON "orders"("checkout_draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_checkout_draft_id_idx" ON "orders"("checkout_draft_id");

-- CreateIndex
CREATE INDEX "orders_source_customer_address_id_idx" ON "orders"("source_customer_address_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_draft_id_fkey" FOREIGN KEY ("checkout_draft_id") REFERENCES "checkout_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_source_customer_address_id_fkey" FOREIGN KEY ("source_customer_address_id") REFERENCES "user_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_drafts" ADD CONSTRAINT "checkout_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_drafts" ADD CONSTRAINT "checkout_drafts_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_drafts" ADD CONSTRAINT "checkout_drafts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_drafts" ADD CONSTRAINT "checkout_drafts_source_customer_address_id_fkey" FOREIGN KEY ("source_customer_address_id") REFERENCES "user_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_draft_items" ADD CONSTRAINT "checkout_draft_items_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "checkout_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_draft_items" ADD CONSTRAINT "checkout_draft_items_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "cart_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_draft_items" ADD CONSTRAINT "checkout_draft_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "inventory_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 15 integrity constraints that Prisma cannot express directly.
CREATE UNIQUE INDEX "payment_transactions_one_pending_per_payment"
ON "payment_transactions" ("payment_id")
WHERE "status" = 'PENDING';

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_shipping_weight_positive"
    CHECK ("shipping_weight_grams" IS NULL OR "shipping_weight_grams" > 0),
  ADD CONSTRAINT "product_variants_shipping_length_positive"
    CHECK ("shipping_length_cm" IS NULL OR "shipping_length_cm" > 0),
  ADD CONSTRAINT "product_variants_shipping_width_positive"
    CHECK ("shipping_width_cm" IS NULL OR "shipping_width_cm" > 0),
  ADD CONSTRAINT "product_variants_shipping_height_positive"
    CHECK ("shipping_height_cm" IS NULL OR "shipping_height_cm" > 0);

ALTER TABLE "checkout_drafts"
  ADD CONSTRAINT "checkout_drafts_amounts_non_negative"
    CHECK (
      "subtotal_amount" >= 0
      AND "discount_amount" >= 0
      AND "total_amount" >= 0
      AND ("shipping_fee" IS NULL OR "shipping_fee" >= 0)
    ),
  ADD CONSTRAINT "checkout_drafts_current_location_has_no_saved_address"
    CHECK (
      "delivery_address_source" IS DISTINCT FROM 'CURRENT_LOCATION'
      OR "source_customer_address_id" IS NULL
    ),
  ADD CONSTRAINT "checkout_drafts_coordinates_valid"
    CHECK (
      ("shipping_latitude" IS NULL OR "shipping_latitude" BETWEEN -90 AND 90)
      AND ("shipping_longitude" IS NULL OR "shipping_longitude" BETWEEN -180 AND 180)
      AND ("shipping_location_accuracy_meters" IS NULL OR "shipping_location_accuracy_meters" >= 0)
    );

ALTER TABLE "checkout_draft_items"
  ADD CONSTRAINT "checkout_draft_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "checkout_draft_items_amounts_non_negative"
    CHECK (
      "unit_price" >= 0
      AND "original_price" >= 0
      AND "discount_amount" >= 0
      AND "line_total" >= 0
    ),
  ADD CONSTRAINT "checkout_draft_items_shipping_positive"
    CHECK (
      "shipping_weight_grams" > 0
      AND "shipping_length_cm" > 0
      AND "shipping_width_cm" > 0
      AND "shipping_height_cm" > 0
    );

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_amounts_non_negative"
    CHECK (
      "subtotal_amount" >= 0
      AND "discount_amount" >= 0
      AND "shipping_fee" >= 0
      AND "total_amount" >= 0
    ),
  ADD CONSTRAINT "orders_current_location_has_no_saved_address"
    CHECK (
      "delivery_address_source" IS DISTINCT FROM 'CURRENT_LOCATION'
      OR "source_customer_address_id" IS NULL
    ),
  ADD CONSTRAINT "orders_coordinates_valid"
    CHECK (
      ("shipping_latitude" IS NULL OR "shipping_latitude" BETWEEN -90 AND 90)
      AND ("shipping_longitude" IS NULL OR "shipping_longitude" BETWEEN -180 AND 180)
      AND ("shipping_location_accuracy_meters" IS NULL OR "shipping_location_accuracy_meters" >= 0)
    );

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_amounts_non_negative"
    CHECK (
      "unit_price" >= 0
      AND "original_price" >= 0
      AND "discount_amount" >= 0
      AND "line_total" >= 0
    ),
  ADD CONSTRAINT "order_items_shipping_positive"
    CHECK (
      "shipping_weight_grams" > 0
      AND "shipping_length_cm" > 0
      AND "shipping_width_cm" > 0
      AND "shipping_height_cm" > 0
    );

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "inventory_reservations"
  ADD CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_quantity_positive" CHECK ("quantity" > 0);

-- Derive shipping metadata only from explicit legacy catalog values.
-- Incomplete package sizes intentionally remain NULL and checkout blocks them.
UPDATE "product_variants"
SET "shipping_weight_grams" = "weight_gram"
WHERE "shipping_weight_grams" IS NULL
  AND "weight_gram" > 0;

WITH parsed AS (
  SELECT
    "id",
    regexp_match(
      lower("package_size"),
      '([0-9]+(?:[.,][0-9]+)?)\s*x\s*([0-9]+(?:[.,][0-9]+)?)\s*x\s*([0-9]+(?:[.,][0-9]+)?)'
    ) AS dimensions
  FROM "product_variants"
  WHERE "package_size" IS NOT NULL
)
UPDATE "product_variants" AS variant
SET
  "shipping_length_cm" = ceil(replace(parsed.dimensions[1], ',', '.')::numeric)::integer,
  "shipping_width_cm" = ceil(replace(parsed.dimensions[2], ',', '.')::numeric)::integer,
  "shipping_height_cm" = ceil(replace(parsed.dimensions[3], ',', '.')::numeric)::integer
FROM parsed
WHERE variant."id" = parsed."id"
  AND parsed.dimensions IS NOT NULL
  AND variant."shipping_length_cm" IS NULL
  AND variant."shipping_width_cm" IS NULL
  AND variant."shipping_height_cm" IS NULL;
