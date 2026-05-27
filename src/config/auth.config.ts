import { registerAs } from '@nestjs/config';
import { getYamlEnvironmentConfig } from './yaml.config';

export default registerAs('auth', () => getYamlEnvironmentConfig().auth);
