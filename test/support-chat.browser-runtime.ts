import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNotificationEnvironment } from './helpers/notification-environment';
import { SupportRealtimeService } from '@/modules/support/support-realtime.service';
import { SupportService } from '@/modules/support/support.service';
import { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';
import { ulid } from 'ulid';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer, type Server } from 'node:http';

async function main() {
  const env = await createNotificationEnvironment(
    18000,
    true,
    undefined,
    'http://localhost:5173',
  );
  // Browser localhost can resolve to IPv6. Rebind the isolated server with dual stack.
  await new Promise<void>((resolve, reject) =>
    (env.app.getHttpServer() as Server).close((error) =>
      error ? reject(error) : resolve(),
    ),
  );
  await env.app.listen(18000, '::');
  const order = await env.place();
  const foreign = await env.app
    .get(SupportService)
    .create(await env.principal(env.customerB), {
      type: 'GENERAL',
      branchId: env.branches[0].id,
      message: {
        clientMessageId: ulid(),
        text: 'Foreign owner negative fixture',
      },
    });
  const directory = join(tmpdir(), 'bookora-support-evidence');
  mkdirSync(directory, { recursive: true });
  const fixture = {
    ready: true,
    database: env.infra.database.databaseName,
    api: env.url,
    customer: env.customerA.user.email,
    admin: env.admin.user.email,
    branchId: env.branches[0].id,
    orderId: order.orderId,
    foreignTicketId: foreign.ticketId,
  };
  writeFileSync(
    join(directory, 'browser-fixture.json'),
    JSON.stringify(fixture, null, 2),
  );
  console.log(JSON.stringify(fixture));
  const input = createInterface({ input: process.stdin });
  input.on('error', () => input.close());
  const execute = async (line: string) => {
    if (line === 'save') {
      writeFileSync(
        join(directory, 'browser-server-timings.json'),
        JSON.stringify(
          env.app.get(SupportRealtimeService).timingSnapshot(),
          null,
          2,
        ),
      );
      console.log('SUPPORT_EVIDENCE_SAVED');
      const status = await promisify(execFile)(
        process.execPath,
        [
          join(process.cwd(), 'node_modules/prisma/build/index.js'),
          'migrate',
          'status',
        ],
        {
          env: {
            ...process.env,
            DATABASE_URL: env.infra.database.databaseUrl,
          },
        },
      );
      writeFileSync(
        join(directory, 'migration-status.log'),
        status.stdout + status.stderr,
      );
    }
    if (line === 'order-event') {
      const result = await env.place();
      console.log(JSON.stringify({ orderEvent: result.orderId }));
    }
    if (line === 'close') {
      input.close();
      for (const row of await env.prisma.supportAttachment.findMany({
        select: { objectKey: true },
      }))
        await env.app
          .get(R2ObjectStorageService)
          .delete({ visibility: 'private', key: row.objectKey });
      await env.close();
      console.log('SUPPORT_DISPOSABLE_RUNTIME_CLOSED');
    }
  };
  input.on('line', (line) => {
    void execute(line).catch((error: unknown) =>
      console.error(
        error instanceof Error ? error.message : 'Runtime action failed',
      ),
    );
  });
  // Loopback-only fixture control survives terminal/tool reconnection; no app route is added.
  const control = createServer((req, res) => {
    if (
      req.method !== 'POST' ||
      !['/save', '/order-event', '/close'].includes(req.url ?? '')
    ) {
      res.writeHead(404).end();
      return;
    }
    const command = req.url!.slice(1);
    void execute(command)
      .then(() => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, command }));
        if (command === 'close') control.close();
      })
      .catch(() => res.writeHead(500).end('Fixture command failed'));
  });
  await new Promise<void>((resolve) =>
    control.listen(18001, '127.0.0.1', resolve),
  );
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Runtime failed');
  process.exitCode = 1;
});
