require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`
      SELECT count(*)::int AS reviews,
        count(*) FILTER (WHERE matches = 1)::int AS exact,
        count(*) FILTER (WHERE matches > 1)::int AS ambiguous,
        count(*) FILTER (WHERE matches = 0)::int AS unmatched
      FROM (SELECT r.id, count(oi.id) AS matches FROM reviews r
        LEFT JOIN order_items oi ON oi.order_id = r.order_id AND oi.product_id = r.product_id
        GROUP BY r.id) audit
    `);
    console.log(JSON.stringify(result.rows[0]));
    const validity = await client.query(`SELECT
      count(*) FILTER (WHERE r.user_id <> o.user_id)::int AS wrong_owner,
      count(*) FILTER (WHERE o.status <> 'COMPLETED')::int AS incomplete_order,
      count(*) FILTER (WHERE r.rating NOT BETWEEN 1 AND 5)::int AS invalid_rating
      FROM reviews r JOIN orders o ON o.id = r.order_id`);
    console.log('review validity:', JSON.stringify(validity.rows[0]));
    const columns = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'reviews' ORDER BY ordinal_position`);
    console.log('review columns:', columns.rows.map(row => row.column_name).join(', '));
    console.log('image max bytes:', process.env.IMAGE_UPLOAD_MAX_BYTES || 5242880);
    const snapshotPath = join(process.env.USERPROFILE, 'Downloads', 'bookora-backups', 'review-upgrade-predeploy.json');
    const rows = await client.query('SELECT * FROM reviews ORDER BY id');
    if (process.argv.includes('--snapshot')) {
      mkdirSync(join(snapshotPath, '..'), { recursive: true });
      writeFileSync(snapshotPath, JSON.stringify(rows.rows, null, 2), { flag: 'wx' });
      console.log('snapshot:', snapshotPath);
    }
    if (process.argv.includes('--verify')) {
      const previous = JSON.parse(readFileSync(snapshotPath, 'utf8'));
      const unchanged = previous.length === rows.rows.length && previous.every((oldRow, index) =>
        Object.entries(oldRow).every(([key, value]) => JSON.stringify(value) === JSON.stringify(rows.rows[index][key])));
      if (!unchanged) {
        const currentById = new Map(rows.rows.map(row => [row.id, row]));
        console.log('changed legacy fields:', JSON.stringify(previous.flatMap(oldRow => {
          const row = currentById.get(oldRow.id);
          const fields = Object.keys(oldRow).filter(key => JSON.stringify(oldRow[key]) !== JSON.stringify(row?.[key]));
          return fields.length ? [{ id: oldRow.id, fields }] : [];
        })));
        throw new Error('Legacy review data changed unexpectedly');
      }
      console.log('legacy fields unchanged:', unchanged, 'before:', previous.length, 'after:', rows.rows.length);
      console.log('linked:', rows.rows.filter(row => row.order_item_id).length, 'unresolved:', rows.rows.filter(row => !row.order_item_id).length);
    }
    await client.query('ROLLBACK');
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
