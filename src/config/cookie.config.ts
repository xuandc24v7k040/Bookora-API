import { registerAs } from '@nestjs/config';
import { getEnvString } from './env.utils';

export default registerAs('cookie', () => ({
  domain: getEnvString('COOKIE_DOMAIN'),
  secret: getEnvString('COOKIE_SECRET'),
}));
