import { registerAs } from '@nestjs/config';
import { getEnvString } from './env.utils';

export default registerAs('database', () => ({
  url: getEnvString('DATABASE_URL'),
}));
