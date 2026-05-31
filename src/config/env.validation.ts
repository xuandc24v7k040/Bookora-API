const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'REFRESH_TOKEN_HASH_SECRET',
] as const;

const OPTIONAL_NUMBER_ENV_KEYS = [
  'PORT',
  'AUTH_LOGIN_MAX_ATTEMPTS',
  'AUTH_EMAIL_MAX_FAILED_ATTEMPTS',
  'AUTH_LOCK_WINDOW_MINUTES',
  'AUTH_EMAIL_LOCK_SECONDS',
  'AUTH_IP_MAX_ATTEMPTS',
  'AUTH_IP_MAX_FAILED_ATTEMPTS',
  'AUTH_IP_LOCK_SECONDS',
  'AUTH_ATTEMPT_WINDOW_SECONDS',
  'AUTH_LOGIN_TTL_SECONDS',
  'AUTH_LOGIN_LIMIT',
  'AUTH_LOGIN_THROTTLE_TTL_SECONDS',
  'AUTH_LOGIN_THROTTLE_LIMIT',
  'AUTH_REGISTER_TTL_SECONDS',
  'AUTH_REGISTER_LIMIT',
  'AUTH_REFRESH_TTL_SECONDS',
  'AUTH_REFRESH_LIMIT',
  'AUTH_CSRF_TTL_SECONDS',
  'AUTH_CSRF_LIMIT',
] as const;

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];

  for (const key of REQUIRED_ENV_KEYS) {
    if (!isPresent(config[key])) {
      errors.push(`${key} is required`);
    }
  }

  for (const key of OPTIONAL_NUMBER_ENV_KEYS) {
    const value = config[key];

    if (isPresent(value) && Number.isNaN(Number(value))) {
      errors.push(`${key} must be a number`);
    }
  }

  const turnstileEnabled = config.TURNSTILE_ENABLED;
  if (
    isPresent(turnstileEnabled) &&
    turnstileEnabled !== 'true' &&
    turnstileEnabled !== 'false'
  ) {
    errors.push('TURNSTILE_ENABLED must be true or false');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join(', ')}`);
  }

  return config;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}
