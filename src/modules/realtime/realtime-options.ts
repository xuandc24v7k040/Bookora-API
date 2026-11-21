import type { ConfigService } from '@nestjs/config';

export function realtimeOptions(config: ConfigService) {
  const origins = (
    config.get<string>('REALTIME_ORIGINS') ||
    config.getOrThrow<string>('app.corsOrigin')
  )
    .split(',')
    .map((s) => s.trim());
  if (
    origins.some((origin) => {
      try {
        return new URL(origin).origin !== origin || !/^https?:/.test(origin);
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      'REALTIME_ORIGINS phải chứa các HTTP(S) origin tường minh.',
    );
  const path = config.get<string>('REALTIME_PATH') || '/socket.io';
  if (!/^\/[a-zA-Z0-9/_.-]+$/.test(path))
    throw new Error('REALTIME_PATH không hợp lệ.');
  return { origins, path };
}
