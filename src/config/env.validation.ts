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
  for (const key of REQUIRED_ENV_KEYS) {
    if (!isEnvValuePresent(config, key)) {
      errors.push(`${key} is required`);
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

  const trustProxy = readEnvValue(config, 'TRUST_PROXY');
  if (
    trustProxy !== undefined &&
    trustProxy !== 'true' &&
    trustProxy !== 'false' &&
    (!/^\d+$/.test(trustProxy) || Number(trustProxy) < 0)
  ) {
    errors.push('TRUST_PROXY must be true, false, or a non-negative integer');
  }

  if (
    readEnvValue(config, 'NODE_ENV') === 'production' &&
    readEnvValue(config, 'TURNSTILE_ENABLED') !== 'true'
  ) {
    errors.push('TURNSTILE_ENABLED must be true in production');
  }

  if (
    readEnvValue(config, 'NODE_ENV') === 'production' &&
    readEnvValue(config, 'TURNSTILE_ENABLED') === 'true' &&
    !isEnvValuePresent(config, 'TURNSTILE_SECRET_KEY')
  ) {
    errors.push('TURNSTILE_SECRET_KEY is required when TURNSTILE_ENABLED=true');
  }

  if (
    readEnvValue(config, 'NODE_ENV') === 'production' &&
    readEnvValue(config, 'TURNSTILE_ENABLED') === 'true' &&
    !isEnvValuePresent(config, 'TURNSTILE_EXPECTED_HOSTNAMES')
  ) {
    errors.push(
      'TURNSTILE_EXPECTED_HOSTNAMES is required when TURNSTILE_ENABLED=true in production',
    );
  }

  const turnstileTimeoutMs = readEnvValue(config, 'TURNSTILE_TIMEOUT_MS');
  if (turnstileTimeoutMs !== undefined && Number(turnstileTimeoutMs) <= 0) {
    errors.push('TURNSTILE_TIMEOUT_MS must be greater than 0');
  }

  const expectedHostnames = readEnvValue(
    config,
    'TURNSTILE_EXPECTED_HOSTNAMES',
  );
  if (
    expectedHostnames !== undefined &&
    expectedHostnames
      .split(',')
      .map((hostname) => hostname.trim())
      .some((hostname) => hostname.length === 0)
  ) {
    errors.push('TURNSTILE_EXPECTED_HOSTNAMES must not contain empty entries');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join(', ')}`);
  }

  return config;
}
