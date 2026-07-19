import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Client } from 'pg';
import { loadEnvFile } from '../../src/config/env.loader';

interface CheckDefinition {
  name: string;
  sql: string;
}

interface CheckResult {
  name: string;
  blockerCount: number;
}

const CHECKS: CheckDefinition[] = [
  {
    name: 'branch-price-conflicts',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT variant_id
        FROM branch_product_prices
        WHERE is_active
        GROUP BY variant_id
        HAVING COUNT(DISTINCT ROW(
          original_price, sale_price, sale_start_at, sale_end_at
        )) > 1
      ) conflicts
    `,
  },
  {
    name: 'reserved-stock',
    sql: `SELECT COUNT(*)::int AS count
          FROM branch_product_stocks WHERE reserved_quantity <> 0`,
  },
  {
    name: 'reviews-with-multiple-replies',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT review_id FROM review_replies
        GROUP BY review_id HAVING COUNT(*) > 1
      ) conflicts
    `,
  },
  {
    name: 'coupon-usages-without-order',
    sql: `SELECT COUNT(*)::int AS count
          FROM coupon_usages WHERE order_id IS NULL`,
  },
  {
    name: 'coupon-usage-order-mismatch',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM coupon_usages usage
      JOIN orders order_row ON order_row.id = usage.order_id
      WHERE order_row.coupon_id IS DISTINCT FROM usage.coupon_id
         OR order_row.discount_amount IS DISTINCT FROM usage.discount_amount
    `,
  },
  {
    name: 'orphan-option-mappings',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM product_variant_option_values link
      LEFT JOIN product_variants variant ON variant.id = link.variant_id
      LEFT JOIN product_option_values value ON value.id = link.option_value_id
      LEFT JOIN product_options option_row ON option_row.id = value.option_id
      WHERE variant.id IS NULL OR value.id IS NULL OR option_row.id IS NULL
    `,
  },
  {
    name: 'variant-selects-multiple-values-for-option',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT link.variant_id, value.option_id
        FROM product_variant_option_values link
        JOIN product_option_values value ON value.id = link.option_value_id
        GROUP BY link.variant_id, value.option_id
        HAVING COUNT(*) > 1
      ) conflicts
    `,
  },
  {
    name: 'order-items-without-variant',
    sql: `SELECT COUNT(*)::int AS count FROM order_items WHERE variant_id IS NULL`,
  },
  {
    name: 'combo-order-items',
    sql: `SELECT COUNT(*)::int AS count
          FROM order_items WHERE combo_id IS NOT NULL OR item_type <> 'PRODUCT'`,
  },
  {
    name: 'orphan-variant-media',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM product_variant_media media
      LEFT JOIN product_variants variant ON variant.id = media.variant_id
      LEFT JOIN products product ON product.id = variant.product_id
      WHERE variant.id IS NULL OR product.id IS NULL
    `,
  },
  {
    name: 'variant-media-primary-conflicts',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT variant_id FROM product_variant_media
        WHERE is_primary GROUP BY variant_id HAVING COUNT(*) > 1
      ) conflicts
    `,
  },
  {
    name: 'product-status-preorder',
    sql: `SELECT COUNT(*)::int AS count FROM products WHERE status = 'PREORDER'`,
  },
  {
    name: 'coupon-free-shipping',
    sql: `SELECT COUNT(*)::int AS count
          FROM coupons WHERE discount_type = 'FREE_SHIPPING'`,
  },
  {
    name: 'duplicate-user-role',
    sql: `SELECT COUNT(*)::int AS count FROM (
            SELECT user_id, role_id FROM user_roles
            GROUP BY user_id, role_id HAVING COUNT(*) > 1
          ) duplicates`,
  },
  {
    name: 'duplicate-role-permission',
    sql: `SELECT COUNT(*)::int AS count FROM (
            SELECT role_id, permission_id FROM role_permissions
            GROUP BY role_id, permission_id HAVING COUNT(*) > 1
          ) duplicates`,
  },
  {
    name: 'duplicate-user-permission',
    sql: `SELECT COUNT(*)::int AS count FROM (
            SELECT user_id, permission_id FROM user_permissions
            GROUP BY user_id, permission_id HAVING COUNT(*) > 1
          ) duplicates`,
  },
  {
    name: 'duplicate-user-branch',
    sql: `SELECT COUNT(*)::int AS count FROM (
            SELECT user_id, branch_id FROM user_branches
            GROUP BY user_id, branch_id HAVING COUNT(*) > 1
          ) duplicates`,
  },
  {
    name: 'duplicate-user-branch-role',
    sql: `SELECT COUNT(*)::int AS count FROM (
            SELECT user_branch_id, role_id FROM user_branch_roles
            GROUP BY user_branch_id, role_id HAVING COUNT(*) > 1
          ) duplicates`,
  },
  {
    name: 'duplicate-user-branch-permission',
    sql: `SELECT COUNT(*)::int AS count FROM (
            SELECT user_branch_id, permission_id FROM user_branch_permissions
            GROUP BY user_branch_id, permission_id HAVING COUNT(*) > 1
          ) duplicates`,
  },
  {
    name: 'multiple-active-primary-branches',
    sql: `SELECT COUNT(*)::int AS count FROM (
            SELECT user_id FROM user_branches
            WHERE is_active AND is_primary
            GROUP BY user_id HAVING COUNT(*) > 1
          ) conflicts`,
  },
];

const LEGACY_TABLES_WITHOUT_TARGET = [
  'mega_menus',
  'mega_menu_columns',
  'mega_menu_sections',
  'mega_menu_items',
  'filter_definitions',
  'filter_options',
  'category_filter_sets',
  'stock_movements',
  'stock_transfers',
  'stock_transfer_items',
  'coupon_branches',
  'coupon_products',
  'coupon_categories',
  'coupon_usages',
  'payment_transactions',
  'order_shipments',
  'order_status_histories',
  'notifications',
  'related_products',
  'combos',
  'combo_items',
  'combo_branches',
  'book_series',
  'book_series_items',
  'preorders',
  'book_previews',
  'book_preview_pages',
  'audit_logs',
] as const;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function getOutputPath(): string {
  const argument = process.argv.find((value) => value.startsWith('--output='));
  return resolve(
    argument?.slice('--output='.length) ??
      'docs/schema-refactor/artifacts/preflight.json',
  );
}

async function main(): Promise<void> {
  loadEnvFile();
  const databaseUrl =
    process.env.SCHEMA_REFACTOR_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'SCHEMA_REFACTOR_DATABASE_URL or DATABASE_URL is required for preflight',
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
    const checks: CheckResult[] = [];
    for (const check of CHECKS) {
      const result = await client.query<{ count: number }>(check.sql);
      checks.push({ name: check.name, blockerCount: result.rows[0].count });
    }

    const legacyTableRowCounts: Record<string, number> = {};
    for (const table of LEGACY_TABLES_WITHOUT_TARGET) {
      const result = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`,
      );
      legacyTableRowCounts[table] = result.rows[0].count;
    }

    const nonEmptyLegacyTables = Object.entries(legacyTableRowCounts)
      .filter(([, count]) => count > 0)
      .map(([table]) => table);
    const blockerCount =
      checks.reduce((sum, check) => sum + check.blockerCount, 0) +
      nonEmptyLegacyTables.length;
    const artifact = {
      generatedAt: new Date().toISOString(),
      status: blockerCount === 0 ? 'PASS' : 'BLOCKED',
      blockerCount,
      checks,
      legacyTableRowCounts,
      nonEmptyLegacyTables,
    };
    const outputPath = getOutputPath();
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
      'utf8',
    );
    await client.query('COMMIT');
    console.log(`Preflight ${artifact.status}: ${outputPath}`);
    if (blockerCount > 0) {
      process.exitCode = 2;
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

void main();
