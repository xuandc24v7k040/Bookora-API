import { registerAs } from '@nestjs/config';
import { getEnvString } from './env.utils';

export default registerAs('environment', () => ({
  nodeEnv: getEnvString('NODE_ENV', 'development'),
}));
