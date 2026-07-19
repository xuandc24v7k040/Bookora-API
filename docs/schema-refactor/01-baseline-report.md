# Schema Refactor Baseline Report

Baseline date: 2026-07-19 (Asia/Saigon). All commands ran before schema refactor edits.

| Check | Command | Result |
| --- | --- | --- |
| Prisma format | `npm run prisma:format` | PASS; schema formatted, no schema diff |
| Prisma validate | `npm run prisma:validate` | PASS |
| Prisma generate | `npm run prisma:generate` | PASS; Prisma Client 7.8.0 |
| Migration status | `npx prisma migrate status` | PASS; 5 migrations, up to date |
| TypeScript | `npm run type-check` | PASS |
| ESLint | `npm run lint` | PASS |
| Unit tests | `npm test -- --runInBand` | PASS; 38 suites, 375 tests |
| E2E tests | `npm run test:e2e -- --runInBand` | PASS; 6 suites, 39 tests |
| Build | `npm run build` | PASS; 230 files compiled |
| OpenAPI export | `npm run docs:openapi` | PASS |
| OpenAPI contract | `npm run docs:contract` | PASS; 66 operations, 64 schemas |
| Redocly | `npm run docs:lint` | PASS; 2 known problems explicitly ignored |
| Catalog seed x2 | `node -r ts-node/register -r tsconfig-paths/register prisma/seed.ts` twice | PASS |
| Development seed x2 | `npm run prisma:seed:dev` twice | PASS; sensitive console output suppressed |
| Whitespace | `git diff --check` | PASS |

The E2E run emitted the existing PostgreSQL client deprecation warning about concurrent
`client.query()` usage. It did not fail a test and is not caused by this refactor.

No frontend exists within the current workspace, so frontend generated verification was not
available at baseline.
