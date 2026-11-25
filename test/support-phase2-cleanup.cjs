/* Explicitly scoped local QA cleanup. Default is a read-only dry run. */
const { Client } = require('pg');
const { config } = require('dotenv');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const { S3Client, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
config({ quiet: true });
const hotfix1 = process.argv.includes('--hotfix1');
const directory = join(tmpdir(), hotfix1 ? 'bookora-support-hotfix1-evidence' : 'bookora-support-phase2-evidence');
const fixture = JSON.parse(readFileSync(join(directory, 'fixtures-private.json'), 'utf8'));
const apply = process.argv.includes('--apply');
const quote = value => `"${value.replaceAll('"', '""')}"`;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/bookora_db' || fixture.database !== 'bookora_db' || !fixture.run.startsWith(hotfix1 ? 'support-hf1-' : 'support-p2-')) throw Error('Unexpected cleanup target');
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const userIds = Object.values(fixture.users).map(u => u.id);
    const branchIds = fixture.branches.map(b => b.id);
    const orderIds = fixture.orders.map(o => o.id);
    const users = (await db.query('SELECT id,email FROM users WHERE id = ANY($1::text[])', [userIds])).rows;
    if (users.length !== userIds.length || users.some(u => !u.email.endsWith(`.${fixture.run}@example.test`))) throw Error('Fixture users no longer match manifest');
    const branches = (await db.query('SELECT id,code FROM branches WHERE id = ANY($1::text[])', [branchIds])).rows;
    if (branches.length !== branchIds.length || branches.some(b => !b.code.startsWith(fixture.run + '-'))) throw Error('Fixture branches no longer match');
    const products = (await db.query('SELECT id,slug FROM products WHERE id=$1', [fixture.productId])).rows;
    if (products.length !== 1 || products[0].slug !== fixture.run) throw Error('Fixture product no longer matches');
    const orders = (await db.query('SELECT id,user_id,branch_id FROM orders WHERE id=ANY($1::text[])', [orderIds])).rows;
    if (orders.length !== orderIds.length || orders.some(o => o.user_id !== fixture.users.customer.id || !branchIds.includes(o.branch_id))) throw Error('Fixture orders no longer match');
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
    const foreignKeys = (await db.query(`SELECT c.conrelid::regclass::text AS child,c.confrelid::regclass::text AS parent,
      array_agg(ca.attname::text ORDER BY k.n) AS child_columns,array_agg(pa.attname::text ORDER BY k.n) AS parent_columns
      FROM pg_constraint c JOIN pg_namespace ns ON ns.oid=c.connamespace
      CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY AS k(child_key,parent_key,n)
      JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=k.child_key
      JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=k.parent_key
      WHERE c.contype='f' AND ns.nspname='public' GROUP BY c.oid,c.conrelid,c.confrelid`)).rows;
    await db.query('CREATE TEMP TABLE phase2_owned (table_name text NOT NULL, row_tid tid NOT NULL, PRIMARY KEY(table_name,row_tid)) ON COMMIT DROP');
    for (const [table, ids] of [['users',userIds],['branches',branchIds],['orders',orderIds],['products',[fixture.productId]],['product_variants',[fixture.variantId]]]) {
      await db.query(`INSERT INTO phase2_owned SELECT $1,ctid FROM ${quote(table)} WHERE id=ANY($2::text[]) ON CONFLICT DO NOTHING`, [table,ids]);
    }
    let added;
    do {
      added = 0;
      for (const fk of foreignKeys) {
        const joinOn = fk.child_columns.map((col,i) => `c.${quote(col)}=p.${quote(fk.parent_columns[i])}`).join(' AND ');
        const result = await db.query(`INSERT INTO phase2_owned SELECT $1,c.ctid FROM ${quote(fk.child)} c JOIN ${quote(fk.parent)} p ON ${joinOn} JOIN phase2_owned o ON o.table_name=$2 AND o.row_tid=p.ctid ON CONFLICT DO NOTHING`, [fk.child,fk.parent]);
        added += result.rowCount;
      }
    } while (added);
    const counts = (await db.query('SELECT table_name,count(*)::int AS count FROM phase2_owned GROUP BY table_name ORDER BY table_name')).rows;
    for (const [table, allowed] of [['users',userIds],['branches',branchIds],['orders',orderIds],['products',[fixture.productId]],['product_variants',[fixture.variantId]]]) {
      const unexpected = (await db.query(`SELECT count(*)::int AS n FROM ${quote(table)} t JOIN phase2_owned o ON o.table_name=$1 AND o.row_tid=t.ctid WHERE NOT(t.id=ANY($2::text[]))`, [table,allowed])).rows[0].n;
      if (unexpected) throw Error(`Refusing cleanup of non-fixture ${table}`);
    }
    const tickets = (await db.query("SELECT t.id,t.customer_id,t.branch_id FROM support_tickets t JOIN phase2_owned o ON o.table_name='support_tickets' AND o.row_tid=t.ctid")).rows;
    if (tickets.some(t => t.customer_id !== fixture.users.customer.id || !branchIds.includes(t.branch_id))) throw Error('Refusing cleanup of foreign Support ticket');
    const objects = (await db.query("SELECT a.owner_id,a.object_key FROM support_attachments a JOIN phase2_owned o ON o.table_name='support_attachments' AND o.row_tid=a.ctid")).rows;
    if (objects.length > 100 || objects.some(a => !userIds.includes(a.owner_id) || !a.object_key.startsWith('support/staged/'))) throw Error('Refusing unowned storage cleanup');
    const affected = counts.map(c => c.table_name);
    const dependencies = new Map(affected.map(t => [t,new Set()]));
    for (const fk of foreignKeys) {
      if (!dependencies.has(fk.child) || !dependencies.has(fk.parent)) continue;
      // A statement deletes the entire owned message set before SET NULL fires.
      // The same-table reply relation is not an inter-table dependency cycle.
      if (fk.child === fk.parent && fk.child === 'support_messages') continue;
      const joinOn = fk.child_columns.map((col,i) => `c.${quote(col)}=p.${quote(fk.parent_columns[i])}`).join(' AND ');
      const linked = (await db.query(`SELECT EXISTS(SELECT 1 FROM ${quote(fk.child)} c JOIN ${quote(fk.parent)} p ON ${joinOn} JOIN phase2_owned oc ON oc.table_name=$1 AND oc.row_tid=c.ctid JOIN phase2_owned op ON op.table_name=$2 AND op.row_tid=p.ctid) AS present`,[fk.child,fk.parent])).rows[0].present;
      if (linked) dependencies.get(fk.parent).add(fk.child);
    }
    const order = [];
    while (dependencies.size) {
      const leaves = [...dependencies].filter(([,children]) => children.size===0).map(([table]) => table);
      if (!leaves.length) throw Error('Owned FK cycle requires explicit review; nothing deleted');
      for (const leaf of leaves) { order.push(leaf); dependencies.delete(leaf); for (const children of dependencies.values()) children.delete(leaf); }
    }
    async function snapshot(excludeOwned) {
      const result = {};
      for (const table of tables) {
        const rows = (await db.query(`SELECT row_to_json(t)::text AS row FROM ${quote(table)} t ${excludeOwned ? 'WHERE NOT EXISTS(SELECT 1 FROM phase2_owned o WHERE o.table_name=$1 AND o.row_tid=t.ctid)' : ''} ORDER BY row_to_json(t)::text`, excludeOwned ? [table] : [])).rows;
        result[table] = { count:rows.length,sha256:hash(rows) };
      }
      return result;
    }
    const report = { mode:apply?'apply':'dry-run',database:'bookora_db',run:fixture.run,counts,deleteOrder:order,objects:objects.length,tickets:tickets.map(t=>t.id) };
    if (!apply) {
      await db.query('ROLLBACK');
      writeFileSync(join(directory,'cleanup-plan.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(report,null,2));
      return;
    }
    const before = await snapshot(true);
    const storage = new S3Client({endpoint:process.env.R2_ENDPOINT,region:process.env.R2_REGION||'auto',credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
    let removed = 0;
    for (const object of objects) {
      const args = { Bucket:process.env.R2_PRIVATE_BUCKET||'bookora', Key:object.object_key };
      await storage.send(new DeleteObjectCommand(args));
      try { await storage.send(new HeadObjectCommand(args)); throw Error('QA object still exists'); }
      catch(error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
      removed++;
    }
    storage.destroy();
    report.deleted = {};
    for (const table of order) {
      const result = await db.query(`DELETE FROM ${quote(table)} t USING phase2_owned o WHERE o.table_name=$1 AND o.row_tid=t.ctid`,[table]);
      report.deleted[table] = result.rowCount;
    }
    const after = await snapshot(false);
    report.nonFixtureRowsPreserved = JSON.stringify(before)===JSON.stringify(after);
    if (!report.nonFixtureRowsPreserved) throw Error('Non-fixture preservation mismatch; rolling back DB');
    report.storageObjectsVerifiedAbsent = removed;
    report.nonFixtureBefore = before;
    report.nonFixtureAfter = after;
    await db.query('COMMIT');
    writeFileSync(join(directory,'cleanup-result.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({mode:report.mode,deleted:report.deleted,storageObjectsVerifiedAbsent:removed,nonFixtureRowsPreserved:report.nonFixtureRowsPreserved},null,2));
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { await db.end(); }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Cleanup failed');process.exitCode=1;});
