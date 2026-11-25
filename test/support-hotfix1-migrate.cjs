// Local app DB only, verified backup before forward-only migration.
const { config } = require('dotenv');
const { Client } = require('pg');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { mkdirSync, writeFileSync, statSync } = require('node:fs');
const { createHash } = require('node:crypto');
config({ quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.pathname !== '/bookora_db') throw Error('Unexpected migration target');
  const directory = join(tmpdir(),'bookora-support-hotfix1-evidence');
  mkdirSync(directory,{recursive:true});
  const client = new Client({connectionString:url.toString()});
  await client.connect();
  try {
    const identity = (await client.query('SELECT current_database() AS database, inet_server_addr() AS server, inet_server_port() AS port')).rows[0];
    async function snapshot() {
      const result = {};
      for (const {tablename} of (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows) {
        // Nullable additive column must preserve every pre-existing value.
        const rows = (await client.query(`SELECT (to_jsonb(t) - 'reply_to_message_id')::text AS row FROM "${tablename.replaceAll('"','""')}" t ORDER BY 1`)).rows;
        result[tablename] = {count:rows.length,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
      }
      return result;
    }
    const before = await snapshot();
    const binary = 'D:/PTX_Workplace/New folder/bin/';
    const backup = join(directory,'bookora_db-before-hotfix1.dump');
    const run = (file,args,env=process.env)=>execFileSync(file,args,{env,encoding:'utf8',maxBuffer:8*1024*1024});
    run(binary+'pg_dump.exe',['--host',url.hostname,'--port',url.port||'5432','--username',decodeURIComponent(url.username),'--dbname','bookora_db','--format=custom','--file',backup],{...process.env,PGPASSWORD:decodeURIComponent(url.password)});
    const listing = run(binary+'pg_restore.exe',['--list',backup]);
    if (statSync(backup).size < 1000 || !listing.includes('TABLE DATA public users')) throw Error('Backup verification failed');
    const prisma = join(process.cwd(),'node_modules/prisma/build/index.js');
    writeFileSync(join(directory,'migration-deploy.log'),run(process.execPath,[prisma,'migrate','deploy']));
    writeFileSync(join(directory,'migration-status.log'),run(process.execPath,[prisma,'migrate','status']));
    const after = await snapshot();
    const preserved = JSON.stringify(before) === JSON.stringify(after);
    writeFileSync(join(directory,'db-preservation.json'),JSON.stringify({identity,backup,bytes:statSync(backup).size,before,after,preserved},null,2));
    if (!preserved) throw Error('Existing DB rows changed during migration; inspect preservation evidence');
    console.log(JSON.stringify({identity,backupVerified:true,preserved,migration:'20261125090000_support_message_reply'}));
  } finally {await client.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
