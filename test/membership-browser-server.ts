import { config } from 'dotenv';
import { createInterface } from 'node:readline';
import type { Request, Response, NextFunction } from 'express';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '@/app.module';
import { setupApplication } from '@/core/app.setup';

config({ quiet: true });
const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Local fixture required');
url.pathname = '/bookora_it_auth_hardening_1795320689805_eeb055';
Object.assign(process.env, {
  DATABASE_URL: url.toString(),
  NODE_ENV: 'test',
  CORS_ORIGIN: 'http://localhost:15173,http://127.0.0.1:15174',
  REALTIME_ORIGINS: 'http://localhost:15173,http://127.0.0.1:15174',
  COOKIE_DOMAIN: '',
  TURNSTILE_ENABLED: 'false',
  RESEND_API_KEY: 're_local_capture_only',
  NOTIFICATIONS_POLL_MS: '100',
  AUTH_LOGIN_THROTTLE_LIMIT: '1000',
  AUTH_CSRF_LIMIT: '1000',
});

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.get(ConfigService).set('app.corsOrigin', process.env.CORS_ORIGIN);
  setupApplication(app);
  let failMembership = false;
  const requests: Array<{ path: string; status: number; ms: number }> = [];
  app.use((req: Request, res: Response, next: NextFunction) => {
    const started = Date.now();
    res.on('finish', () => {
      requests.push({
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started,
      });
      if (requests.length > 500) requests.shift();
    });
    if (
      failMembership &&
      req.method === 'GET' &&
      req.path.startsWith('/api/v1/account/membership')
    ) {
      res.status(503).json({ message: 'Fixture controlled outage' });
      return;
    }
    next();
  });
  await app.listen(18000, '127.0.0.1');
  console.log('FIXTURE_SERVER_READY');
  createInterface({ input: process.stdin }).on('line', (line) => {
    if (line === 'fail') failMembership = true;
    if (line === 'recover') failMembership = false;
    if (line === 'metrics') console.log(JSON.stringify(requests));
    if (line === 'clear') requests.length = 0;
    console.log({ failMembership });
  });
}
void main();
