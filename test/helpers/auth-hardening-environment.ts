import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { SendMailInput } from '../../src/modules/mail/mail-provider.interface';
import { createDisposablePostgresDatabase } from './postgres-test-database';

export async function createAuthHardeningEnvironment(
  frontendUrl = 'http://localhost:15173',
  mailboxPort = 0,
) {
  const database = await createDisposablePostgresDatabase('auth_hardening');
  const originalEnv = { ...process.env };
  const messages: SendMailInput[] = [];
  let failDelivery = false;
  let mailbox: Server | undefined;
  try {
    const migration = await promisify(execFile)(
      process.execPath,
      [
        join(process.cwd(), 'node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
      ],
      {
        env: { ...process.env, DATABASE_URL: database.databaseUrl },
        timeout: 120_000,
      },
    );
    mailbox = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/emails') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          if (failDelivery) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                name: 'application_error',
                message: 'Test delivery failure',
              }),
            );
            return;
          }
          const input = JSON.parse(
            Buffer.concat(chunks).toString('utf8'),
          ) as SendMailInput;
          messages.push(input);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: randomUUID() }));
        });
        return;
      }
      // Test-only inbox. Hide raw link text in screenshots while preserving the CTA.
      if (req.method === 'GET' && req.url?.match(/^\/message\/\d+$/)) {
        const input = messages[Number(req.url.split('/').at(-1))];
        if (input) {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Referrer-Policy': 'no-referrer',
            'Cache-Control': 'no-store',
          });
          res.end(
            input.html.replace(
              /(>)(https?:\/\/[^<]+)(<\/a>)/g,
              '$1Mở liên kết Bookora$3',
            ),
          );
          return;
        }
      }
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(
          '<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hộp thư kiểm thử Bookora</title><h1>Hộp thư kiểm thử Bookora</h1><ul>' +
            messages
              .map(
                (input, i) =>
                  `<li><a href="/message/${i}">${i + 1}. ${input.subject}</a></li>`,
              )
              .join('') +
            '</ul></html>',
        );
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve, reject) => {
      mailbox!.once('error', reject);
      mailbox!.listen(mailboxPort, '127.0.0.1', resolve);
    });
    const address = mailbox.address();
    if (!address || typeof address === 'string')
      throw new Error('Test inbox did not bind');
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: database.databaseUrl,
      FRONTEND_URL: frontendUrl,
      CORS_ORIGIN: frontendUrl,
      COOKIE_DOMAIN: '',
      TURNSTILE_ENABLED: 'false',
      RESEND_API_KEY: 're_local_capture_only',
      RESEND_BASE_URL: `http://127.0.0.1:${address.port}`,
      EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: '2',
      EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: '1',
      AUTH_CSRF_LIMIT: '1000',
      AUTH_LOGIN_THROTTLE_LIMIT: '1000',
      AUTH_REGISTER_LIMIT: '1000',
    });
    return {
      database,
      messages,
      migrationOutput: migration.stdout,
      mailboxUrl: `http://127.0.0.1:${address.port}`,
      failDelivery: (fail: boolean) => {
        failDelivery = fail;
      },
      close: async () => {
        await new Promise<void>((resolve) => mailbox!.close(() => resolve()));
        await database.close();
        for (const key of Object.keys(process.env))
          if (!(key in originalEnv)) delete process.env[key];
        Object.assign(process.env, originalEnv);
      },
    };
  } catch (error) {
    mailbox?.close();
    await database.close();
    throw error;
  }
}
