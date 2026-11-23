/** Read-only Git snapshot for reproducible before-browser measurements. No checkout/reset. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = 'ac409fc0fd45fff5c96a487c48de01c87d2ebd9f';
const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'bookora-promotion-baseline-'));
for (const name of ['src', 'prisma', 'test']) fs.cpSync(path.join(root, name), path.join(destination, name), { recursive: true });
for (const name of ['tsconfig.json', 'tsconfig.build.json', 'package.json', 'prisma.config.ts'])
  fs.copyFileSync(path.join(root, name), path.join(destination, name));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(destination, 'node_modules'), 'junction');
const files = [
  'src/modules/notifications/notification-worker.service.ts',
  'src/modules/notifications/notification-intents.ts',
  'src/modules/notifications/notifications.module.ts',
  'src/modules/coupons/coupons.service.ts',
  'src/modules/coupons/coupons.dto.ts',
  'src/modules/flash-sales/flash-sales.service.ts',
  'src/modules/flash-sales/flash-sales.dto.ts',
];
for (const file of files)
  fs.writeFileSync(path.join(destination, file), execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root }));
fs.writeFileSync(path.join(os.tmpdir(), 'bookora-promotion-baseline-path.txt'), destination);
console.log(JSON.stringify({ baseline, destination, restoredSourceFiles: files.length }));
