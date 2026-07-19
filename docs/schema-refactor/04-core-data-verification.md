# Core Data Verification

Status: **PASS**.

The sanitized snapshots cover row counts for every application table and deterministic data and
physical-schema hashes for all 13 Phase 8 core tables. They contain no credentials or row data.

Comparison results:

```text
restored baseline application tables: 67
final application tables: 38
core tables measured: 13
baseline -> reconciliation row-count mismatches: 0
baseline -> reconciliation data-hash mismatches: 0
baseline -> reconciliation schema-hash changes: users only
reconciliation -> final row-count mismatches: 0
reconciliation -> final data-hash mismatches: 0
reconciliation -> final schema-hash mismatches: 0
```

The single baseline-to-reconciliation schema change is the approved exception adding exactly
`users_type_idx` on `users(type)` and `users_is_active_idx` on `users(is_active)`. No column,
data, PK, FK, unique constraint, default, nullability, or other index changed on any core table.
All later additive, constraint, backfill, and destructive stages left all 13 core table hashes
identical to the post-reconciliation snapshot.

Evidence:

- `artifacts/before-summary.json`
- `artifacts/reconciliation-after-summary.json`
- `artifacts/additive-after-summary.json`
- `artifacts/constraints-after-summary.json`
- `artifacts/after-summary.json`
