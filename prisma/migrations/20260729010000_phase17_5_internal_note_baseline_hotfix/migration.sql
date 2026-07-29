-- Forward-only compatibility repair for databases whose Phase 16 migration
-- was recorded without the internal note column.
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "internal_note" TEXT;
