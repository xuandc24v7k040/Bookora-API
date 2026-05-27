import { registerAs } from '@nestjs/config';
import { getYamlEnvironmentConfig } from './yaml.config';

export default registerAs('cookie', () => getYamlEnvironmentConfig().cookie);
