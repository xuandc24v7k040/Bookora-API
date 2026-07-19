# Regression Report

Status: **PASS**.

Final verification results:

```text
Prisma format/validate/generate: PASS
Migration status: PASS (9 applied, up to date)
Prisma/database diff: PASS (empty)
TypeScript type-check: PASS
ESLint: PASS
Unit: 38 suites / 375 tests PASS
E2E: 7 suites / 44 tests PASS
Build: PASS (201 files compiled)
OpenAPI export/contract: PASS (66 operations / 64 schemas)
Redocly: PASS (2 known problems explicitly ignored)
Catalog seed x2: PASS
Development seed x2: PASS
```

The new PostgreSQL E2E suite adds five target-invariant tests covering simple/one-option/two-option
products, duplicate variant combinations and option assignments, product/variant primary media,
draft and idempotently confirmed receipts, concurrent atomic stock increments, and invalid
quantity checks.

The generated OpenAPI document and `authorization-contract.md` are unchanged. No frontend
project exists in this workspace, so no frontend regeneration applies.

The development seed intentionally re-hashes its fixed development password on every execution.
Therefore seed execution was verified on the separate fresh rehearsal database; migration data
immutability is proven independently by the frozen before/reconciliation/final core snapshots.
