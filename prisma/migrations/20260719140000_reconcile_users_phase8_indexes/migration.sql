-- Approved Phase 8 reconciliation exception: these indexes are already declared
-- in the Prisma User model but were never added by a deployed migration.
CREATE INDEX "users_type_idx" ON "users"("type");
CREATE INDEX "users_is_active_idx" ON "users"("is_active");
