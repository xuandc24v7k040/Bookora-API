-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('ORDER', 'SHIPPING');

-- CreateEnum
CREATE TYPE "CouponVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "CouponRedemptionStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "type" "CouponType" NOT NULL DEFAULT 'ORDER',
ADD COLUMN     "usage_limit_per_user" INTEGER,
ADD COLUMN     "visibility" "CouponVisibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "coupon_discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "order_coupon_discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shipping_coupon_discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "coupon_type" "CouponType" NOT NULL,
    "coupon_code_snapshot" TEXT NOT NULL,
    "applied_discount_amount" DECIMAL(12,2) NOT NULL,
    "status" "CouponRedemptionStatus" NOT NULL,
    "reserved_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_status_idx" ON "coupon_redemptions"("coupon_id", "status");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_user_id_status_idx" ON "coupon_redemptions"("coupon_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "coupon_redemptions_status_expires_at_idx" ON "coupon_redemptions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "coupon_redemptions_user_id_idx" ON "coupon_redemptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_order_id_coupon_type_key" ON "coupon_redemptions"("order_id", "coupon_type");

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve legacy rows; reject future case-insensitive collisions at the database boundary.
CREATE UNIQUE INDEX "coupons_normalized_code_key" ON "coupons" (upper(btrim("code")));
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_amounts_check" CHECK (
  "order_coupon_discount_amount" >= 0 AND "order_coupon_discount_amount" <= "subtotal_amount"
  AND "shipping_coupon_discount_amount" >= 0 AND "shipping_coupon_discount_amount" <= "shipping_fee");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_coupon_amount_check" CHECK (
  "coupon_discount_amount" >= 0 AND "coupon_discount_amount" <= "line_total");
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_amount_check" CHECK ("applied_discount_amount" >= 0);
