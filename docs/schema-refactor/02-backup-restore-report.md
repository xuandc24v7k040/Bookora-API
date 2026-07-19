# Backup and Restore Rehearsal

## Backup

- Timestamp: `2026-07-19T13:57:44Z`.
- Source identity: local PostgreSQL database `bookora_db` (credentials omitted).
- Tool: `pg_dump 18.4`, custom format, schema + data, no owner/privilege metadata.
- Dump size: 234,957 bytes.
- Storage: local temporary directory outside the Git repository.
- Dump is not tracked by Git and is not copied into `docs/schema-refactor`.

Result: PASS.

## Restore rehearsal

- Target: `bookora_schema_refactor_rehearsal_20260719`.
- Tool: `createdb 18.4` + `pg_restore 18.4`.
- Restore result: PASS.
- Prisma connection/migration status: PASS; all five migrations are up to date.
- Restored application tables: 67.
- Core data row counts/hashes: source and clone match for all 13 tables.

PostgreSQL restore recreated tables without the ordinal gaps left by previously dropped columns
in `users`, `branches` and `user_addresses`. Column names/types/defaults/nullability,
constraints and index definitions match; only physical ordinal numbers differ between source
and a freshly restored database. The before/after migration comparison is performed on the
same restored clone, where schema hashes include ordinal positions and must remain identical.

Restore path: recreate a clean database, run `pg_restore --no-owner --no-privileges` with the
custom-format dump, then verify `prisma migrate status` and the snapshot hashes.
