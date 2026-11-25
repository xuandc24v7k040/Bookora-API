const { spawn } = require('node:child_process');
const { mkdirSync, createWriteStream, writeFileSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { createServer } = require('node:http');
const directory = join(tmpdir(), 'bookora-support-evidence');
mkdirSync(directory, { recursive: true });
const apiRoot = resolve(__dirname, '..');
const webRoot = resolve(apiRoot, '../../bookora-web/bookora-web');
const npmCli = join(process.env.APPDATA || '', 'npm/node_modules/npm/bin/npm-cli.js');
const realNpm = require('node:fs').existsSync(npmCli) ? npmCli : 'C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js';
const contractsOnly = process.argv.includes('--contracts-only');
const recordPath = join(directory, 'checks.json');
const results = contractsOnly && require('node:fs').existsSync(recordPath) ? JSON.parse(readFileSync(recordPath, 'utf8')) : [];
function run(name, args, cwd = apiRoot, extraEnv = {}) {
  return new Promise(resolveRun => {
    const log = createWriteStream(join(directory, `${name}.log`));
    console.log(`START ${name}`);
    const child = spawn(process.execPath, [realNpm, ...args], { cwd, env: { ...process.env, ...extraEnv }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log); child.stderr.pipe(log);
    child.on('exit', code => {
      const result = { name, command: `npm ${args.join(' ')}`, cwd, exitCode: code, log: join(directory, `${name}.log`) };
      results.push(result);
      writeFileSync(join(directory, 'checks.json'), JSON.stringify(results, null, 2));
      log.end(); console.log(`END ${name} ${code}`); resolveRun(code);
    });
  });
}
async function main() {
  if (!contractsOnly) {
  await run('typecheck', ['run', 'type-check']);
  await run('lint', ['run', 'lint']);
  await run('prisma-validate', ['run', 'prisma:validate']);
  await run('build', ['run', 'build']);
  await run('unit', ['test', '--', '--runInBand', 'src/modules/authorization', 'src/shared/storage/r2-object-storage.service.spec.ts', 'src/modules/auth/guards', 'src/modules/notifications']);
  await run('integration', ['run', 'test:e2e', '--', '--runInBand', 'support-chat.e2e-spec.ts', 'support-files.e2e-spec.ts', 'order-realtime.e2e-spec.ts', 'notifications-http.e2e-spec.ts']);
  }
  await run('openapi-export', ['run', 'docs:openapi'], apiRoot, { TS_NODE_TRANSPILE_ONLY: 'true' });
  await run('openapi-contract', ['run', 'docs:contract']);
  await run('openapi-lint', ['run', 'docs:lint']);
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(readFileSync(join(apiRoot, 'docs/openapi.json'))); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    await run('web-generation', ['run', 'gen:api:local'], webRoot, { OPENAPI_URL: `http://127.0.0.1:${server.address().port}/docs-json` });
  } finally { await new Promise(r => server.close(r)); }
  await run('web-tests', ['test', '--', 'src/lib/realtime', 'src/features/notifications/notification-realtime.test.ts', 'src/features/orders/state/order-realtime.test.ts', 'src/features/orders/customer-order-detail-realtime.test.ts', 'src/api/http/__tests__/client.test.ts'], webRoot);
  await run('web-build', ['run', 'build'], webRoot);
  console.log(JSON.stringify(results.map(({ name, exitCode }) => ({ name, exitCode }))));
  process.exitCode = [...new Map(results.map(result => [result.name, result])).values()].some(result => result.exitCode !== 0) ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
