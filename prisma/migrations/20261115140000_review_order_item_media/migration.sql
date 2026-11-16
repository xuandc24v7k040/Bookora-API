BEGIN;

ALTER TABLE "reviews" ADD COLUMN "order_item_id" TEXT;

-- Only attach history when the purchased line is unambiguous. Do not touch timestamps.
UPDATE "reviews" r SET "order_item_id" = candidates.item_id
FROM (
  SELECT r.id, min(oi.id) AS item_id
  FROM reviews r JOIN order_items oi
    ON oi.order_id = r.order_id AND oi.product_id = r.product_id
  GROUP BY r.id HAVING count(*) = 1
) candidates WHERE r.id = candidates.id;

CREATE UNIQUE INDEX "reviews_order_item_id_key" ON "reviews"("order_item_id");
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Retain uniqueness for unresolved legacy pairs while allowing independent new lines.
CREATE UNIQUE INDEX "reviews_legacy_user_order_product_key"
  ON "reviews"("user_id", "order_id", "product_id") WHERE "order_item_id" IS NULL;
DROP INDEX "reviews_user_id_order_id_product_id_key";

CREATE TABLE "review_media" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "review_id" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL CHECK ("sort_order" BETWEEN 0 AND 3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_media_review_id_fkey" FOREIGN KEY ("review_id")
    REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "review_media_object_key_key" ON "review_media"("object_key");
CREATE UNIQUE INDEX "review_media_review_id_sort_order_key" ON "review_media"("review_id", "sort_order");

COMMIT;
