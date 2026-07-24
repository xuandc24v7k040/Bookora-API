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

  if (readEnvValue(config, 'STORAGE_PROVIDER') !== 'r2') {
    errors.push('STORAGE_PROVIDER must be r2');
  }

  const publicBaseUrl = readEnvValue(config, 'R2_PUBLIC_BASE_URL');
  if (publicBaseUrl) {
    try {
      const parsed = new URL(publicBaseUrl);
      if (parsed.protocol !== 'https:') {
        errors.push('R2_PUBLIC_BASE_URL must use https');
      }
    } catch {
      errors.push('R2_PUBLIC_BASE_URL must be a valid URL');
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

  for (const key of [
    'GHN_BASE_URL',
    'VNPAY_PAYMENT_URL',
    'VNPAY_QUERY_URL',
    'VNPAY_RETURN_URL',
    'VNPAY_FRONTEND_RESULT_URL',
    'VNPAY_IPN_URL',
  ]) {
    const rawValue = config[key];
    const value = readEnvValue(config, key);
    if (!value) continue;
    if (
      typeof rawValue === 'string' &&
      (rawValue !== rawValue.trim() ||
        /^["']|["']$/.test(rawValue) ||
        /[\r\n]/.test(rawValue))
    ) {
      errors.push(`${key} must not contain quotes or surrounding whitespace`);
      continue;
    }
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        errors.push(`${key} must use http or https`);
      }
    } catch {
      errors.push(`${key} must be a valid URL`);
    }
  }

  if (readEnvValue(config, 'NODE_ENV') !== 'production') {
    const apiPrefix = readEnvValue(config, 'API_PREFIX') ?? 'api';
    const returnUrl = readEnvValue(config, 'VNPAY_RETURN_URL');
    const frontendResultUrl = readEnvValue(config, 'VNPAY_FRONTEND_RESULT_URL');
    if (returnUrl) {
      try {
        const parsed = new URL(returnUrl);
        if (
          parsed.hostname !== 'localhost' ||
          parsed.pathname !== `/${apiPrefix}/v1/payments/vnpay/return`
        ) {
          errors.push(
            `VNPAY_RETURN_URL must target /${apiPrefix}/v1/payments/vnpay/return on localhost`,
          );
        }
      } catch {
        // The generic URL validation above reports the controlled error.
      }
    }
    if (frontendResultUrl) {
      try {
        const parsed = new URL(frontendResultUrl);
        if (
          parsed.hostname !== 'localhost' ||
          parsed.pathname !== '/checkout/payment-result'
        ) {
          errors.push(
            'VNPAY_FRONTEND_RESULT_URL must target /checkout/payment-result on localhost',
          );
        }
      } catch {
        // The generic URL validation above reports the controlled error.
      }
    }
  }

  if (Number(readEnvValue(config, 'GHN_SHOP_ID')) <= 0) {
    errors.push('GHN_SHOP_ID must be a positive integer');
  }
  if (Number(readEnvValue(config, 'GHN_TIMEOUT_MS')) <= 0) {
    errors.push('GHN_TIMEOUT_MS must be greater than 0');
  }
  for (const key of [
    'GHN_DEFAULT_ITEM_WEIGHT_GRAMS',
    'GHN_DEFAULT_PACKAGE_LENGTH_CM',
    'GHN_DEFAULT_PACKAGE_WIDTH_CM',
    'GHN_DEFAULT_PACKAGE_HEIGHT_CM',
  ]) {
    if (Number(readEnvValue(config, key)) <= 0) {
      errors.push(`${key} must be greater than 0`);
    }
  }
  if (Number(readEnvValue(config, 'VNPAY_PAYMENT_EXPIRE_MINUTES')) <= 0) {
    errors.push('VNPAY_PAYMENT_EXPIRE_MINUTES must be greater than 0');
  }
  if (readEnvValue(config, 'VNPAY_ENV') !== 'sandbox') {
    errors.push('VNPAY_ENV must be sandbox for this integration');
  }
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join(', ')}`);
  }

  return config;
}
