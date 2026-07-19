import { Client } from 'pg';
import { loadEnvFile } from '../../src/config/env.loader';

interface CountRow {
  count: number;
}

async function count(client: Client, sql: string): Promise<number> {
  const result = await client.query<CountRow>(sql);
  return result.rows[0].count;
}

async function assertNoBlockers(client: Client): Promise<void> {
  const priceConflicts = await count(
    client,
    `
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
  );
  const replyConflicts = await count(
    client,
    `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT review_id
        FROM review_replies
        GROUP BY review_id
        HAVING COUNT(*) > 1
      ) conflicts
    `,
  );
  const mappedOptionLinks = await count(
    client,
    `SELECT COUNT(*)::int AS count FROM product_variant_option_values`,
  );
  const ambiguousOptionlessProducts = await count(
    client,
    `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT product_id
        FROM product_variants
        GROUP BY product_id
        HAVING COUNT(*) > 1
      ) products
    `,
  );

  const blockers = {
    priceConflicts,
    replyConflicts,
    mappedOptionLinks,
    ambiguousOptionlessProducts,
  };
  if (Object.values(blockers).some((value) => value > 0)) {
    throw new Error(`Backfill blocked: ${JSON.stringify(blockers)}`);
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const databaseUrl =
    process.env.SCHEMA_REFACTOR_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'SCHEMA_REFACTOR_DATABASE_URL or DATABASE_URL is required for backfill',
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await assertNoBlockers(client);

    const productFields = await client.query(`
      UPDATE product_variants variant
      SET isbn = COALESCE(variant.isbn, product.isbn),
          publication_year = COALESCE(
            variant.publication_year,
            product.publication_year
          ),
          page_count = COALESCE(variant.page_count, product.page_count),
          weight_gram = COALESCE(variant.weight_gram, product.weight_gram),
          package_size = COALESCE(variant.package_size, product.package_size)
      FROM products product
      WHERE product.id = variant.product_id
    `);
    const prices = await client.query(`
      UPDATE product_variants variant
      SET original_price = price.original_price,
          sale_price = price.sale_price,
          sale_start_at = price.sale_start_at,
          sale_end_at = price.sale_end_at
      FROM (
        SELECT DISTINCT ON (variant_id)
          variant_id,
          original_price,
          sale_price,
          sale_start_at,
          sale_end_at
        FROM branch_product_prices
        WHERE is_active
        ORDER BY variant_id, branch_id
      ) price
      WHERE price.variant_id = variant.id
        AND variant.original_price IS NULL
    `);
    const defaults = await client.query(`
      UPDATE product_variants
      SET combination_key = 'DEFAULT'
      WHERE combination_key IS NULL
    `);
    const media = await client.query(`
      INSERT INTO product_media (
        id,
        product_id,
        variant_id,
        type,
        url,
        alt_text,
        sort_order,
        is_primary,
        created_at,
        updated_at
      )
      SELECT
        media.id,
        variant.product_id,
        media.variant_id,
        'IMAGE'::"ProductMediaType",
        media.url,
        media.alt_text,
        media.sort_order,
        media.is_primary,
        media.created_at,
        media.created_at
      FROM product_variant_media media
      JOIN product_variants variant ON variant.id = media.variant_id
      WHERE NOT EXISTS (
        SELECT 1 FROM product_media target WHERE target.id = media.id
      )
    `);
    const replies = await client.query(`
      UPDATE reviews review
      SET reply_content = reply.content,
          replied_by_id = reply.admin_id,
          replied_at = reply.created_at
      FROM review_replies reply
      WHERE reply.review_id = review.id
        AND review.reply_content IS NULL
        AND review.replied_by_id IS NULL
        AND review.replied_at IS NULL
    `);

    const verification = {
      productFieldsUpdated: productFields.rowCount ?? 0,
      pricesUpdated: prices.rowCount ?? 0,
      defaultCombinationsUpdated: defaults.rowCount ?? 0,
      mediaInserted: media.rowCount ?? 0,
      repliesUpdated: replies.rowCount ?? 0,
      sourceVariantMedia: await count(
        client,
        `SELECT COUNT(*)::int AS count FROM product_variant_media`,
      ),
      targetVariantMedia: await count(
        client,
        `SELECT COUNT(*)::int AS count
         FROM product_media WHERE variant_id IS NOT NULL`,
      ),
      sourceReplies: await count(
        client,
        `SELECT COUNT(*)::int AS count FROM review_replies`,
      ),
      targetReplies: await count(
        client,
        `SELECT COUNT(*)::int AS count
         FROM reviews WHERE reply_content IS NOT NULL`,
      ),
    };

    if (
      verification.sourceVariantMedia !== verification.targetVariantMedia ||
      verification.sourceReplies !== verification.targetReplies
    ) {
      throw new Error(
        `Backfill verification failed: ${JSON.stringify(verification)}`,
      );
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ status: 'PASS', ...verification }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

void main();
