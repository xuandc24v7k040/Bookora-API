const { Client } = require('pg');
const { config } = require('dotenv');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
config({ quiet: true });
const directory = join(tmpdir(), 'bookora-support-phase2-evidence');
mkdirSync(directory, { recursive: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/bookora_db') throw Error('Unexpected DB target');
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const identity = (await client.query('SELECT current_database() AS database, inet_server_addr() AS server, inet_server_port() AS port, version() AS version')).rows[0];
    const migrations = (await client.query('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name')).rows;
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const hashes = {};
    for (const { tablename } of tables) {
      if (tablename.startsWith('support_') || ['_prisma_migrations', 'permissions', 'role_permissions'].includes(tablename)) continue;
      const rows = (await client.query(`SELECT row_to_json(t)::text AS row FROM "${tablename.replaceAll('"','""')}" t ORDER BY row_to_json(t)::text`)).rows;
      hashes[tablename] = { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
    }
    const grants = (await client.query("SELECT r.code AS role,p.code AS permission FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.code LIKE 'support.%' ORDER BY r.code,p.code")).rows;
    const report = { identity, migrations, hashes, grants };
    const after = process.argv.includes('--after');
    if (after) {
      const before = JSON.parse(readFileSync(join(directory,'db-before.json'),'utf8'));
      report.preserved = Object.entries(before.hashes).every(([table,value]) => JSON.stringify(value) === JSON.stringify(hashes[table]));
    } else {
      const binary = (await client.query('SHOW data_directory')).rows[0].data_directory;
      report.dataDirectory = binary;
    }
    writeFileSync(join(directory, after ? 'db-after.json' : 'db-before.json'), JSON.stringify(report,null,2));
    for (const [label, cwd] of [['web','D:/CTU/CT466E/bookora-web/bookora-web'],['api',process.cwd()]]) {
      const git = args => execFileSync('git',args,{cwd,encoding:'utf8'});
      const baseline = { head:git(['rev-parse','HEAD']).trim(), branch:git(['branch','--show-current']).trim(), status:git(['status','--short']), stat:git(['diff','--stat']) };
      writeFileSync(join(directory,`${label}-${after?'final':'baseline'}.json`),JSON.stringify(baseline,null,2));
    }
    console.log(JSON.stringify({ identity, migrationCount:migrations.length, latest:migrations.at(-1), tables:tables.length, grants, preserved:report.preserved, dataDirectory:report.dataDirectory, evidence:directory },null,2));
  } finally { await client.end(); }
}
main().catch(e=>{ console.error(e.message); process.exitCode=1; });
