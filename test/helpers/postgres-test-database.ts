import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env', quiet: true });

const MIGRATION_PATHS = [
  '20260604082015_init',
  '20260621090000_authorization_phase_1',
  '20260623120000_branch_scoped_staff_assignments',
  '20260714090000_add_user_gender_birthday',
  '20260714170000_two_level_addresses',
] as const;

export interface DisposablePostgresDatabase {
  databaseUrl: string;
  databaseName: string;
  runSql(sql: string): Promise<void>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  close(): Promise<void>;
}

export async function createDisposablePostgresDatabase(
  label: string,
): Promise<DisposablePostgresDatabase> {
  const explicitlyConfiguredTestServer = Boolean(process.env.TEST_DATABASE_URL);
  const baseUrl = new URL(
    process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://postgres:password@localhost:5432/bookora_db',
  );
  assertSafeTestServer(baseUrl, explicitlyConfiguredTestServer);
  const databaseName = `bookora_it_${sanitizeIdentifier(label)}_${Date.now()}_${randomBytes(3).toString('hex')}`;
  const adminUrl = maintenanceDatabaseUrl(baseUrl).toString();
  const admin = new Client({ connectionString: adminUrl });

  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  } finally {
    await admin.end().catch(() => undefined);
  }

  const databaseUrl = databaseUrlFor(baseUrl, databaseName).toString();
  const client = new Client({ connectionString: databaseUrl });
  let operationQueue = Promise.resolve();
  let closed = false;
  try {
    await client.connect();
  } catch (error) {
    await dropDatabase(adminUrl, databaseName);
    throw error;
  }

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    databaseUrl,
    databaseName,
    runSql: (sql: string) =>
      enqueue(async () => {
        await client.query(sql);
      }),
    query: <T extends Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) =>
      enqueue(async () => {
        const result = await client.query<T>(sql, params);
        return result.rows;
      }),
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await enqueue(async () => {
        await client.end().catch(() => undefined);
      });
      await dropDatabase(adminUrl, databaseName);
    },
  };
}

export async function runMigrations(
  database: DisposablePostgresDatabase,
  migrationNames: readonly (typeof MIGRATION_PATHS)[number][] = MIGRATION_PATHS,
): Promise<void> {
  for (const migrationName of migrationNames) {
    await database.runSql(readMigrationSql(migrationName));
  }
}

export async function runBranchScopedMigrationInTransaction(
  database: DisposablePostgresDatabase,
): Promise<void> {
  await database.runSql('BEGIN');
  try {
    await database.runSql(
      readMigrationSql('20260623120000_branch_scoped_staff_assignments'),
    );
    await database.runSql('COMMIT');
  } catch (error) {
    await database.runSql('ROLLBACK');
    throw error;
  }
}

export function readMigrationSql(migrationName: string): string {
  return readFileSync(
    join(process.cwd(), 'prisma', 'migrations', migrationName, 'migration.sql'),
    'utf8',
  );
}

function maintenanceDatabaseUrl(url: URL): URL {
  return databaseUrlFor(url, 'postgres');
}

function databaseUrlFor(url: URL, databaseName: string): URL {
  const next = new URL(url.toString());
  next.pathname = `/${databaseName}`;
  return next;
}

function sanitizeIdentifier(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 24);
}

function assertSafeTestServer(url: URL, explicitlyConfigured: boolean): void {
  if (explicitlyConfigured) {
    return;
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!localHosts.has(url.hostname)) {
    throw new Error(
      'Refusing to create a disposable database on a non-local DATABASE_URL. Set TEST_DATABASE_URL explicitly for an approved test server.',
    );
  }
}

async function dropDatabase(
  adminUrl: string,
  databaseName: string,
): Promise<void> {
  const dropAdmin = new Client({ connectionString: adminUrl });
  try {
    await dropAdmin.connect();
    await dropAdmin.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
      [databaseName],
    );
    await dropAdmin.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
    );
  } finally {
    await dropAdmin.end().catch(() => undefined);
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}
