import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import type { INestApplicationContext } from '@nestjs/common';
import type { Server, ServerOptions } from 'socket.io';
import { realtimeOptions } from './realtime-options';

export class RealtimeIoAdapter extends IoAdapter {
  private readonly settings: ReturnType<typeof realtimeOptions>;
  constructor(app: INestApplicationContext, config: ConfigService) {
    super(app);
    this.settings = realtimeOptions(config);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      path: this.settings.path,
      maxHttpBufferSize: 8192,
      cors: { origin: this.settings.origins, credentials: true },
      allowRequest: (req, callback) =>
        callback(
          null,
          Boolean(
            req.headers.origin &&
            this.settings.origins.includes(req.headers.origin),
          ),
        ),
    }) as Server;
  }
}
