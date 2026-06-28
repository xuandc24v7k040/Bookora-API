import { registerAs } from '@nestjs/config';
import { getEnvNumber, getEnvString } from './env.utils';

export default registerAs('app', () => ({
  name: getEnvString('APP_NAME', 'Exam API'),
  port: getEnvNumber('PORT', 8000),
  apiPrefix: getEnvString('API_PREFIX', 'api'),
  corsOrigin: getEnvString(
    'FRONTEND_URL',
    getEnvString('CORS_ORIGIN', 'http://localhost:5173'),
  ),
  frontendUrl: getEnvString('FRONTEND_URL', 'http://localhost:5173'),
  trustProxy: parseTrustProxy(getEnvString('TRUST_PROXY', 'false')),
}));

function parseTrustProxy(value: string): boolean | number {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false' || normalizedValue === '') {
    return false;
  }

  return Number(normalizedValue);
}
