import appConfig from './app.config';
import authConfig from './auth.config';
import cookieConfig from './cookie.config';
import databaseConfig from './database.config';
import { validateEnv } from './env.validation';
import runtimeConfig from './runtime.config';
import storageConfig from './storage.config';

export const configurations = [
  appConfig,
  authConfig,
  cookieConfig,
  databaseConfig,
  runtimeConfig,
  storageConfig,
];

export {
  appConfig,
  authConfig,
  cookieConfig,
  databaseConfig,
  runtimeConfig,
  storageConfig,
  validateEnv,
};
