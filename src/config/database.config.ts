import { registerAs } from '@nestjs/config';
import { getYamlEnvironmentConfig } from './yaml.config';

export default registerAs(
  'database',
  () => getYamlEnvironmentConfig().database,
);
