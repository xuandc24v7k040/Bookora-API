import { registerAs } from '@nestjs/config';
import {
  getEnvBoolean,
  getEnvNumber,
  getEnvNumberFromKeys,
  getEnvString,
} from './env.utils';

export default registerAs('auth', () => ({
  jwt: {
    accessSecret: getEnvString('JWT_ACCESS_SECRET'),
    refreshSecret: getEnvString('JWT_REFRESH_SECRET'),
    refreshTokenHashSecret: getEnvString('REFRESH_TOKEN_HASH_SECRET'),
    accessExpiresIn: getEnvString('JWT_ACCESS_EXPIRES_IN', '15m'),
    refreshExpiresIn: getEnvString('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
  login: {
    emailMaxFailedAttempts: getEnvNumberFromKeys(
      ['AUTH_LOGIN_MAX_ATTEMPTS', 'AUTH_EMAIL_MAX_FAILED_ATTEMPTS'],
      5,
    ),
    emailLockSeconds: getEnvNumberFromKeys(
      ['AUTH_EMAIL_LOCK_SECONDS'],
      getEnvNumber('AUTH_LOCK_WINDOW_MINUTES', 1) * 60,
    ),
    ipMaxFailedAttempts: getEnvNumberFromKeys(
      ['AUTH_IP_MAX_ATTEMPTS', 'AUTH_IP_MAX_FAILED_ATTEMPTS'],
      10,
    ),
    ipLockSeconds: getEnvNumber('AUTH_IP_LOCK_SECONDS', 120),
    attemptWindowSeconds: getEnvNumberFromKeys(
      ['AUTH_ATTEMPT_WINDOW_SECONDS', 'AUTH_LOGIN_TTL_SECONDS'],
      60,
    ),
  },
  passwordRecovery: {
    emailMaxAttempts: getEnvNumber('AUTH_PASSWORD_RESET_EMAIL_MAX_ATTEMPTS', 5),
    emailLockSeconds: getEnvNumber(
      'AUTH_PASSWORD_RESET_EMAIL_LOCK_SECONDS',
      15 * 60,
    ),
    ipMaxAttempts: getEnvNumber('AUTH_PASSWORD_RESET_IP_MAX_ATTEMPTS', 15),
    ipLockSeconds: getEnvNumber('AUTH_PASSWORD_RESET_IP_LOCK_SECONDS', 15 * 60),
    attemptWindowSeconds: getEnvNumber(
      'AUTH_PASSWORD_RESET_ATTEMPT_WINDOW_SECONDS',
      15 * 60,
    ),
  },
  throttle: {
    login: {
      ttlSeconds: getEnvNumberFromKeys(
        ['AUTH_LOGIN_TTL_SECONDS', 'AUTH_LOGIN_THROTTLE_TTL_SECONDS'],
        60,
      ),
      limit: getEnvNumberFromKeys(
        ['AUTH_LOGIN_LIMIT', 'AUTH_LOGIN_THROTTLE_LIMIT'],
        30,
      ),
    },
    register: {
      ttlSeconds: getEnvNumber('AUTH_REGISTER_TTL_SECONDS', 60),
      limit: getEnvNumber('AUTH_REGISTER_LIMIT', 10),
    },
    refresh: {
      ttlSeconds: getEnvNumber('AUTH_REFRESH_TTL_SECONDS', 60),
      limit: getEnvNumber('AUTH_REFRESH_LIMIT', 10),
    },
    csrf: {
      ttlSeconds: getEnvNumber('AUTH_CSRF_TTL_SECONDS', 60),
      limit: getEnvNumber('AUTH_CSRF_LIMIT', 10),
    },
    forgotPassword: {
      ttlSeconds: getEnvNumber('AUTH_FORGOT_PASSWORD_TTL_SECONDS', 60),
      limit: getEnvNumber('AUTH_FORGOT_PASSWORD_LIMIT', 10),
    },
  },
  google: {
    clientId: getEnvString('GOOGLE_CLIENT_ID'),
    clientSecret: getEnvString('GOOGLE_CLIENT_SECRET'),
    callbackUrl: getEnvString(
      'GOOGLE_CALLBACK_URL',
      'http://localhost:3000/api/v1/auth/google/callback',
    ),
  },
  turnstile: {
    enabled: getEnvBoolean('TURNSTILE_ENABLED', false),
    secretKey: getEnvString('TURNSTILE_SECRET_KEY'),
    siteverifyUrl: getEnvString(
      'TURNSTILE_SITEVERIFY_URL',
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    ),
    expectedHostnames: getEnvString('TURNSTILE_EXPECTED_HOSTNAMES', '')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
    expectedActions: {
      login: getEnvString('TURNSTILE_LOGIN_ACTION', 'login'),
      register: getEnvString('TURNSTILE_REGISTER_ACTION', 'register'),
      passwordReset: getEnvString(
        'TURNSTILE_PASSWORD_RESET_ACTION',
        'password-reset',
      ),
    },
    timeoutMs: getEnvNumber('TURNSTILE_TIMEOUT_MS', 3000),
  },
}));
