// Forward-only deployment to the explicitly verified local development database.
const { config } = require('dotenv');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { statSync, writeFileSync } = require('node:fs');
config({ quiet: true });
const url = new URL(process.env.DATABASE_URL);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.pathname !== '/bookora_db') throw Error('Unexpected DB target');
const directory = join(tmpdir(),'bookora-support-phase2-evidence');
const binary = 'D:/PTX_Workplace/New folder/bin/';
const run = (file,args,env=process.env) => execFileSync(file,args,{env,encoding:'utf8',maxBuffer:8*1024*1024});
const prisma = join(process.cwd(),'node_modules/prisma/build/index.js');
try { writeFileSync(join(directory,'migration-before.log'),run(process.execPath,[prisma,'migrate','status'])); }
catch(e) { writeFileSync(join(directory,'migration-before.log'),String(e.stdout)+String(e.stderr)); }
const backup = join(directory,'bookora_db-before-support.dump');
run(binary+'pg_dump.exe',['--host',url.hostname,'--port',url.port||'5432','--username',decodeURIComponent(url.username),'--dbname','bookora_db','--format=custom','--file',backup],{...process.env,PGPASSWORD:decodeURIComponent(url.password)});
const listing = run(binary+'pg_restore.exe',['--list',backup]);
if (statSync(backup).size < 1000 || !listing.includes('TABLE DATA public users')) throw Error('Backup verification failed');
writeFileSync(join(directory,'backup.json'),JSON.stringify({path:backup,bytes:statSync(backup).size,archiveListingVerified:true},null,2));
writeFileSync(join(directory,'migration-deploy.log'),run(process.execPath,[prisma,'migrate','deploy']));
writeFileSync(join(directory,'migration-after.log'),run(process.execPath,[prisma,'migrate','status']));
console.log('Verified backup and forward migration completed; logs saved in '+directory);
