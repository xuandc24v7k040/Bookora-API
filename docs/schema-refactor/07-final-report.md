# Schema Refactor Final Report

Overall status: **DONE on rehearsal and development source database**.

## BOUND

- No historical migration was edited or squashed.
- The approved reconciliation is a dedicated forward migration before every schema-refactor
  migration and adds only `users_type_idx` and `users_is_active_idx`.
- All 13 Phase 8 core tables have unchanged data. Relative to the post-reconciliation checkpoint,
  every core schema hash is also unchanged through the final migration.
- Backup/dump remains outside Git; repository evidence is sanitized.
- Preflight and destructive safety checks both found zero blockers.
- The destructive migration was rehearsed on isolated databases before its approved deployment to
  the development source database `bookora_db`.

## VERIFY

- Final Prisma schema: exactly 38 models and 13 enums.
- Final restored-clone database: exactly 38 application tables.
- All 9 migrations rehearse cleanly both from the restored production-like clone and from an
  empty database.
- Backfill ran twice and was idempotent.
- Final Prisma/database diff is empty.
- Core snapshot/checksum comparison has zero row-count or data-hash mismatches.
- Full Prisma, unit, E2E, seed x2, OpenAPI, lint, type-check, and build gates pass.
- OpenAPI remains 66 operations / 64 schemas and is unchanged.

## DONE

The 67-model source schema has been reduced to the approved 38-model target. The four new forward
migrations implement reconciliation, additive targets, constraints, and guarded cleanup in that
order. Versioned preflight, snapshot, and transactional backfill tools plus sanitized reports are
included for deployment rehearsal and audit.

The approved forward migrations are now deployed on `bookora_db`. The rehearsal clone remains
available for comparison until post-deployment acceptance is complete.

Primary evidence:

```text
docs/schema-refactor/artifacts/before-summary.json
docs/schema-refactor/artifacts/preflight.json
docs/schema-refactor/artifacts/reconciliation-after-summary.json
docs/schema-refactor/artifacts/additive-after-summary.json
docs/schema-refactor/artifacts/backfill-run-1.log
docs/schema-refactor/artifacts/backfill-run-2.log
docs/schema-refactor/artifacts/constraints-after-summary.json
docs/schema-refactor/artifacts/after-summary.json
docs/schema-refactor/artifacts/final-diff.sql
```

## Source database deployment

Status: **PASS**.

### Backup and deployment boundary

- Effective `DATABASE_URL` and `SELECT current_database()` both identified
  `localhost:5432/bookora_db` before backup and migration.
- Backend, Prisma Studio, seed processes, and pgAdmin database sessions were stopped before the
  backup. No external session remained connected to `bookora_db` at the migration gate.
- Fresh PostgreSQL 18.4 custom-format backup:
  `C:\Users\Admin\AppData\Local\Temp\bookora-source-deployment-20260719\bookora_db-before-source-deploy-20260719T151853Z.dump`.
- Backup size: 235,241 bytes. SHA-256:
  `CA23921F36822AC2F46D428CA159902418621E4B76A2BBC7B9050C3C43CFA43D`.
- `pg_restore --list` verified the backup archive. It is outside the repository and is not tracked
  by Git.
- Source preflight was read-only and passed with blocker count `0`.
- The source before snapshot recorded 67 application tables and all 13 core tables.

### Applied migrations

`prisma migrate deploy` applied exactly the four pending forward migrations:

```text
20260719140000_reconcile_users_phase8_indexes
20260719150000_add_schema_refactor_targets
20260719160000_enforce_schema_refactor_constraints
20260719170000_remove_deprecated_bookora_models
```

No historical migration was edited or squashed, and no replacement migration was created.

Before/after state:

```text
before: 5 applied migrations, 67 application tables
after:  9 applied migrations, 38 application tables
Prisma models/enums: 38 / 13
deprecated tables remaining: 0 / 31
migration status: up to date
Prisma/database diff: empty
```

### Core checksum

The source `before` and immediate post-migration `after` snapshots compared all 13 Phase 8 core
tables:

```text
row-count mismatches: 0
data-hash mismatches: 0
schema-hash changes: users only
```

The `users` schema-hash change is exactly the approved addition of `users_type_idx` and
`users_is_active_idx`. No other core schema change was detected. The development seed re-hashes
its development password by design and was run only after this migration checksum comparison.

Source evidence:

```text
docs/schema-refactor/artifacts/source-deployment-preflight.json
docs/schema-refactor/artifacts/source-before-summary.json
docs/schema-refactor/artifacts/source-after-summary.json
```

### Post-migration verification

```text
Prisma validate/generate: PASS
TypeScript type-check: PASS
ESLint: PASS
Unit: 38 suites / 375 tests PASS
E2E: 7 suites / 44 tests PASS
Build: PASS (201 files compiled)
Catalog seed x2: PASS
Development seed x2: PASS
OpenAPI contract: PASS (66 operations / 64 schemas)
Redocly: PASS (2 known problems explicitly ignored)
OpenAPI and authorization contract diff: empty
git diff --check: PASS
```

Smoke verification returned HTTP 200 for Health, Auth (`super-admin`, `branch-admin`, and `staff`),
Users, Branches, Roles, Permissions, Branch Admin listing, and Staff assignable role/permission
queries. Because the development `.env` enables Cloudflare Turnstile, authenticated smoke requests
were executed with the application-supported non-production Turnstile bypass; all created sessions
were then logged out/revoked. The backend was restarted with the original `.env`, Turnstile enabled,
and its Health and Auth CSRF endpoints both return HTTP 200.

`bookora_schema_refactor_rehearsal_20260719` is retained and `bookora_db` now has exactly 38
application tables.
