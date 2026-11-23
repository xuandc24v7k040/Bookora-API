import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { NotificationWorker } from './notification-worker.service';
import { PROMOTION_WAKE_CHANNEL } from './promotion-wake-signal';

/** PostgreSQL delivers transactional NOTIFY only after the outer commit. */
@Injectable()
export class PromotionWakeService implements OnModuleInit, OnModuleDestroy {
  private client?: Client;
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private delay = 1000;
  private readonly logger = new Logger(PromotionWakeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly worker: NotificationWorker,
  ) {}

  async onModuleInit(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = undefined;
    const client = this.client;
    this.client = undefined;
    await client?.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const client = new Client({
      connectionString: this.config.getOrThrow<string>('database.url'),
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      application_name: 'bookora-promotion-listener',
    });
    this.client = client;
    const disconnected = () => {
      if (this.client !== client) return;
      this.client = undefined;
      void client.end().catch(() => undefined);
      if (this.stopped || this.retry) return;
      this.logger.warn(
        'Promotion wake tạm gián đoạn; polling vẫn phục hồi dispatch.',
      );
      this.retry = setTimeout(() => {
        this.retry = undefined;
        void this.connect();
      }, this.delay);
      this.retry.unref();
      this.delay = Math.min(30000, this.delay * 2);
    };
    client.on('error', disconnected);
    client.on('end', disconnected);
    client.on('notification', (event) => {
      if (!this.stopped && event.channel === PROMOTION_WAKE_CHANNEL)
        this.worker.wakePromotions();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${PROMOTION_WAKE_CHANNEL}`);
      if (this.stopped) {
        await client.end();
        return;
      }
      this.delay = 1000;
      this.worker.wakePromotions(); // Recover intents committed during a disconnect.
    } catch {
      disconnected();
    }
  }
}
