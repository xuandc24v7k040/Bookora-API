# Migration Rehearsal Report

Status: **PASS** on the restored clone and on a fresh empty database.

No historical migration was edited or squashed. The forward migrations are ordered before the
destructive cleanup:

```text
20260719140000_reconcile_users_phase8_indexes
20260719150000_add_schema_refactor_targets
20260719160000_enforce_schema_refactor_constraints
20260719170000_remove_deprecated_bookora_models
```

## Approved Phase 8 reconciliation

The dedicated reconciliation migration adds only:

```sql
CREATE INDEX "users_type_idx" ON "users"("type");
CREATE INDEX "users_is_active_idx" ON "users"("is_active");
```

On the restored clone it applied successfully, returned the Prisma/database diff to empty, and
changed no core row count or data hash. Only the expected `users` schema hash changed.

## BOUND sequence on restored clone

1. Backup restore and preflight: PASS, zero blockers.
2. Reconciliation migration and no-op schema organization: PASS, empty diff.
3. Additive migration: PASS, empty diff.
4. Transactional backfill twice: PASS and idempotent; every source/target count was zero.
5. Constraint migration: PASS, empty diff.
6. Pre-destructive E2E regression: PASS after updating the test migration harness to include the
   newly added forward migrations.
7. Destructive cleanup: PASS; its safety block rechecked the zero-row/zero-conflict assumptions.
8. Final migration status: all 9 migrations applied; Prisma/database diff empty.

No destructive migration was applied to the authoritative source database.

## Fresh database rehearsal

A separate empty database was created and all 9 migrations were applied from the beginning.
`prisma migrate status` reported up to date and `prisma migrate diff` reported no difference.
Catalog seed x2 and development seed x2 both passed on this final 38-table schema.

Diff and snapshot evidence is stored under `docs/schema-refactor/artifacts`.
