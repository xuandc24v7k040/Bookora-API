-- Phase 13 preflight (2026-07-23):
-- carts=0, cart_items=0, no duplicate carts per user, no duplicate variants
-- across carts owned by the same user. A direct forward-only migration is safe.

DROP INDEX "carts_user_id_branch_id_key";
DROP INDEX "carts_user_id_idx";

ALTER TABLE "cart_items"
ADD COLUMN "last_known_unit_price" DECIMAL(15,2) NOT NULL;

ALTER TABLE "carts"
DROP CONSTRAINT "carts_branch_id_fkey";

ALTER TABLE "carts"
ADD CONSTRAINT "carts_branch_id_fkey"
FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");
