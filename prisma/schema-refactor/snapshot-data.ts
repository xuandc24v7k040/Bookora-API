import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Client, type QueryResultRow } from 'pg';
import { loadEnvFile } from '../../src/config/env.loader';

const CORE_TABLES = [
  'users',
  'auth_sessions',
  'auth_attempts',
  'branches',
  'user_addresses',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'user_permissions',
  'user_branches',
  'user_branch_roles',
  'user_branch_permissions',
] as const;

type CoreTableName = (typeof CORE_TABLES)[number];

interface TableSummary {
  rowCount: number;
  dataHash: string;
  schemaHash: string;
}

interface SnapshotArtifact {
  generatedAt: string;
  database: {
    name: string;
    serverVersion: string;
  };
  applicationTableCount: number;
  tableRowCounts: Record<string, number>;
  coreTables: Record<CoreTableName, TableSummary>;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, stableValue(nestedValue)]),
    );
  }

  return value;
}

function hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

async function listApplicationTables(client: Client): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `);

  return result.rows.map(({ table_name }) => table_name);
}

async function readRows(
  client: Client,
  table: string,
): Promise<QueryResultRow[]> {
  const result = await client.query(
    `SELECT * FROM ${quoteIdentifier(table)} ORDER BY to_jsonb(${quoteIdentifier(table)})::text`,
  );
  return result.rows;
}

async function readSchemaMetadata(
  client: Client,
  table: string,
): Promise<QueryResultRow[]> {
  const columns = await client.query(
    `
      SELECT
        column_name,
        ordinal_position,
        data_type,
        udt_name,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [table],
  );
  const constraints = await client.query(
    `
      SELECT conname, contype, pg_get_constraintdef(oid, true) AS definition
      FROM pg_constraint
      WHERE conrelid = ('public.' || quote_ident($1))::regclass
      ORDER BY conname
    `,
    [table],
  );
  const indexes = await client.query(
    `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY indexname
    `,
    [table],
  );

  return [
    { section: 'columns', rows: columns.rows },
    { section: 'constraints', rows: constraints.rows },
    { section: 'indexes', rows: indexes.rows },
  ];
}

function getOutputPath(): string {
  const argument = process.argv.find((value) => value.startsWith('--output='));
  return resolve(
    argument?.slice('--output='.length) ??
      'docs/schema-refactor/artifacts/before-summary.json',
  );
}

async function main(): Promise<void> {
  loadEnvFile();
  const databaseUrl =
    process.env.SCHEMA_REFACTOR_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'SCHEMA_REFACTOR_DATABASE_URL or DATABASE_URL is required for snapshot',
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    const identity = await client.query<{
      name: string;
      server_version: string;
    }>(`
      SELECT current_database() AS name,
             current_setting('server_version') AS server_version
    `);
    const tables = await listApplicationTables(client);
    const tableRowCounts: Record<string, number> = {};

    for (const table of tables) {
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(table)}`,
      );
      tableRowCounts[table] = Number(result.rows[0].count);
    }

    const coreTables = {} as Record<CoreTableName, TableSummary>;
    for (const table of CORE_TABLES) {
      const rows = await readRows(client, table);
      const schemaMetadata = await readSchemaMetadata(client, table);
      coreTables[table] = {
        rowCount: rows.length,
        dataHash: hash(rows),
        schemaHash: hash(schemaMetadata),
      };
    }

    const artifact: SnapshotArtifact = {
      generatedAt: new Date().toISOString(),
      database: {
        name: identity.rows[0].name,
        serverVersion: identity.rows[0].server_version,
      },
      applicationTableCount: tables.length,
      tableRowCounts,
      coreTables,
    };

    const outputPath = getOutputPath();
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
      'utf8',
    );
    await client.query('COMMIT');
    console.log(`Snapshot written: ${outputPath}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

void main();
