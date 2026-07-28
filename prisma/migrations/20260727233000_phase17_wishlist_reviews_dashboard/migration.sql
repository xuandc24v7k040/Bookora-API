-- Phase 17 has no legacy Review rows in the verified preflight database.
-- Keep this migration forward-only and fail rather than inventing an Order.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "reviews" WHERE "order_id" IS NULL) THEN
    RAISE EXCEPTION 'Phase 17 migration blocked: reviews.order_id contains NULL values';
  END IF;
END $$;

DROP INDEX IF EXISTS "reviews_user_id_product_id_key";
DROP INDEX IF EXISTS "reviews_product_id_idx";
DROP INDEX IF EXISTS "reviews_is_visible_idx";

ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_order_id_fkey";
ALTER TABLE "reviews" ALTER COLUMN "order_id" SET NOT NULL;

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_check"
  CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_content_check"
  CHECK (
    "content" IS NULL
    OR (length(btrim("content")) > 0 AND length("content") <= 2000)
  );

CREATE UNIQUE INDEX "reviews_user_id_order_id_product_id_key"
  ON "reviews"("user_id", "order_id", "product_id");
CREATE INDEX "reviews_user_id_created_at_idx"
  ON "reviews"("user_id", "created_at");
CREATE INDEX "reviews_product_id_is_visible_created_at_idx"
  ON "reviews"("product_id", "is_visible", "created_at");
