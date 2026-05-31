import {
  OPTIONAL_BOOLEAN_ENV_KEYS,
  OPTIONAL_NUMBER_ENV_KEYS,
  REQUIRED_ENV_KEYS,
} from './env.keys';
import { isEnvValuePresent, readEnvValue } from './env.utils';

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];
  const nodeEnv = readEnvValue(config, 'NODE_ENV');

  for (const key of REQUIRED_ENV_KEYS) {
    const value = readEnvValue(config, key);

    if (!isEnvValuePresent(config, key)) {
      errors.push(`${key} is required`);
      continue;
    }

    if (nodeEnv === 'production' && value?.startsWith('change-me')) {
      errors.push(`${key} must be replaced for production`);
    }
  }

  for (const key of OPTIONAL_NUMBER_ENV_KEYS) {
    const value = readEnvValue(config, key);

    if (value !== undefined && !Number.isFinite(Number(value))) {
      errors.push(`${key} must be a finite number`);
    }
  }

  for (const key of OPTIONAL_BOOLEAN_ENV_KEYS) {
    const value = readEnvValue(config, key);

    if (value !== undefined && value !== 'true' && value !== 'false') {
      errors.push(`${key} must be true or false`);
    }
  }

  if (
    nodeEnv === 'production' &&
    readEnvValue(config, 'TURNSTILE_ENABLED') === 'true' &&
    !isEnvValuePresent(config, 'TURNSTILE_SECRET_KEY')
  ) {
    errors.push('TURNSTILE_SECRET_KEY is required when TURNSTILE_ENABLED=true');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join(', ')}`);
  }

  return config;
}
