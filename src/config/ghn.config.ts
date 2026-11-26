import { registerAs } from '@nestjs/config';
import { createHash } from 'node:crypto';

export type GhnConfig =
  | { enabled: false }
  | { enabled: true; valid: false }
  | {
      enabled: true;
      valid: true;
      baseUrl: string;
      token: string;
      shopId: string;
      timeoutMs: number;
      scope: string;
    };

/** Invalid integration settings disable GHN only; INTERNAL remains operational. */
export function parseGhnConfig(env: NodeJS.ProcessEnv): GhnConfig {
  if (env.GHN_ENABLED !== 'true') return { enabled: false };
  try {
    const url = new URL(env.GHN_BASE_URL ?? 'https://online-gateway.ghn.vn');
    const timeoutMs = Number(env.GHN_TIMEOUT_MS ?? 5000);
    const token = env.GHN_TOKEN?.trim();
    const shopId = env.GHN_SHOP_ID?.trim();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !['online-gateway.ghn.vn', 'dev-online-gateway.ghn.vn'].includes(
        url.hostname,
      ) ||
      !token ||
      !shopId ||
      !/^[1-9]\d*$/.test(shopId) ||
      !Number.isSafeInteger(Number(shopId)) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 15000
    )
      return { enabled: true, valid: false };
    return {
      enabled: true,
      valid: true,
      baseUrl: url.origin,
      token,
      shopId,
      timeoutMs,
      scope: createHash('sha256')
        .update(JSON.stringify([url.origin, token, shopId]))
        .digest('hex'),
    };
  } catch {
    return { enabled: true, valid: false };
  }
}

export default registerAs('ghn', () => parseGhnConfig(process.env));
