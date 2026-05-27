import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';

export interface YamlEnvironmentConfig {
  app: {
    name: string;
    port: number;
    apiPrefix: string;
    corsOrigin: string;
    frontendUrl: string;
  };
  database: {
    url: string;
  };
  environment: {
    nodeEnv: string;
  };
  cookie: {
    domain: string;
    secret: string;
  };
  auth: {
    jwt: {
      accessSecret: string;
      refreshSecret: string;
      refreshTokenHashSecret: string;
      accessExpiresIn: string;
      refreshExpiresIn: string;
    };
    login: {
      emailMaxFailedAttempts: number;
      emailLockSeconds: number;
      ipMaxFailedAttempts: number;
      ipLockSeconds: number;
      attemptWindowSeconds: number;
    };
    throttle: {
      login: {
        ttlSeconds: number;
        limit: number;
      };
      register: {
        ttlSeconds: number;
        limit: number;
      };
      refresh: {
        ttlSeconds: number;
        limit: number;
      };
      csrf: {
        ttlSeconds: number;
        limit: number;
      };
    };
    google: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    turnstile: {
      enabled: boolean;
      secretKey: string;
      siteverifyUrl: string;
    };
  };
}

let cachedYamlConfig: YamlEnvironmentConfig | undefined;

export function getYamlEnvironmentConfig(): YamlEnvironmentConfig {
  cachedYamlConfig ??= loadYamlEnvironmentConfig();
  return cachedYamlConfig;
}

function loadYamlEnvironmentConfig(): YamlEnvironmentConfig {
  const environmentName = process.env.NODE_ENV ?? 'development';
  const filePath = join(
    process.cwd(),
    'config',
    'env',
    `${environmentName}.yaml`,
  );
  const config = yaml.load(
    readFileSync(filePath, 'utf8'),
  ) as YamlEnvironmentConfig;

  return applyEnvironmentOverrides(config);
}

function applyEnvironmentOverrides(
  config: YamlEnvironmentConfig,
): YamlEnvironmentConfig {
  return {
    ...config,
    app: {
      ...config.app,
      name: process.env.APP_NAME ?? config.app.name,
      port: toNumber(process.env.PORT, config.app.port),
      apiPrefix: process.env.API_PREFIX ?? config.app.apiPrefix,
      corsOrigin:
        process.env.FRONTEND_URL ??
        process.env.CORS_ORIGIN ??
        config.app.corsOrigin,
      frontendUrl: process.env.FRONTEND_URL ?? config.app.frontendUrl,
    },
    database: {
      ...config.database,
      url: process.env.DATABASE_URL ?? config.database.url,
    },
    environment: {
      ...config.environment,
      nodeEnv: process.env.NODE_ENV ?? config.environment.nodeEnv,
    },
    cookie: {
      ...config.cookie,
      domain: process.env.COOKIE_DOMAIN ?? config.cookie.domain,
      secret: process.env.COOKIE_SECRET ?? config.cookie.secret,
    },
    auth: {
      ...config.auth,
      jwt: {
        ...config.auth.jwt,
        accessSecret:
          process.env.JWT_ACCESS_SECRET ?? config.auth.jwt.accessSecret,
        refreshSecret:
          process.env.JWT_REFRESH_SECRET ?? config.auth.jwt.refreshSecret,
        refreshTokenHashSecret:
          process.env.REFRESH_TOKEN_HASH_SECRET ??
          config.auth.jwt.refreshTokenHashSecret,
        accessExpiresIn:
          process.env.JWT_ACCESS_EXPIRES_IN ?? config.auth.jwt.accessExpiresIn,
        refreshExpiresIn:
          process.env.JWT_REFRESH_EXPIRES_IN ??
          config.auth.jwt.refreshExpiresIn,
      },
      login: {
        ...config.auth.login,
        emailMaxFailedAttempts: toNumber(
          process.env.AUTH_EMAIL_MAX_FAILED_ATTEMPTS,
          config.auth.login.emailMaxFailedAttempts,
        ),
        emailLockSeconds: toNumber(
          process.env.AUTH_EMAIL_LOCK_SECONDS,
          config.auth.login.emailLockSeconds,
        ),
        ipMaxFailedAttempts: toNumber(
          process.env.AUTH_IP_MAX_FAILED_ATTEMPTS,
          config.auth.login.ipMaxFailedAttempts,
        ),
        ipLockSeconds: toNumber(
          process.env.AUTH_IP_LOCK_SECONDS,
          config.auth.login.ipLockSeconds,
        ),
        attemptWindowSeconds: toNumber(
          process.env.AUTH_ATTEMPT_WINDOW_SECONDS,
          config.auth.login.attemptWindowSeconds,
        ),
      },
      throttle: {
        login: {
          ttlSeconds: toNumber(
            process.env.AUTH_LOGIN_THROTTLE_TTL_SECONDS,
            config.auth.throttle.login.ttlSeconds,
          ),
          limit: toNumber(
            process.env.AUTH_LOGIN_THROTTLE_LIMIT,
            config.auth.throttle.login.limit,
          ),
        },
        register: {
          ttlSeconds: toNumber(
            process.env.AUTH_REGISTER_TTL_SECONDS,
            config.auth.throttle.register.ttlSeconds,
          ),
          limit: toNumber(
            process.env.AUTH_REGISTER_LIMIT,
            config.auth.throttle.register.limit,
          ),
        },
        refresh: {
          ttlSeconds: toNumber(
            process.env.AUTH_REFRESH_TTL_SECONDS,
            config.auth.throttle.refresh.ttlSeconds,
          ),
          limit: toNumber(
            process.env.AUTH_REFRESH_LIMIT,
            config.auth.throttle.refresh.limit,
          ),
        },
        csrf: {
          ttlSeconds: toNumber(
            process.env.AUTH_CSRF_TTL_SECONDS,
            config.auth.throttle.csrf.ttlSeconds,
          ),
          limit: toNumber(
            process.env.AUTH_CSRF_LIMIT,
            config.auth.throttle.csrf.limit,
          ),
        },
      },
      google: {
        ...config.auth.google,
        clientId: process.env.GOOGLE_CLIENT_ID ?? config.auth.google.clientId,
        clientSecret:
          process.env.GOOGLE_CLIENT_SECRET ?? config.auth.google.clientSecret,
        callbackUrl:
          process.env.GOOGLE_CALLBACK_URL ?? config.auth.google.callbackUrl,
      },
      turnstile: {
        ...config.auth.turnstile,
        enabled: toBoolean(
          process.env.TURNSTILE_ENABLED,
          config.auth.turnstile.enabled,
        ),
        secretKey:
          process.env.TURNSTILE_SECRET_KEY ?? config.auth.turnstile.secretKey,
        siteverifyUrl:
          process.env.TURNSTILE_SITEVERIFY_URL ??
          config.auth.turnstile.siteverifyUrl,
      },
    },
  };
}

function toNumber(value: string | undefined, fallback: number): number {
  return value === undefined ? fallback : Number(value);
}

function toBoolean(value: string | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value === 'true';
}
