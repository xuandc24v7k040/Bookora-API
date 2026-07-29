import appConfig from './app.config';
import authConfig from './auth.config';
import cookieConfig from './cookie.config';
import databaseConfig from './database.config';
import { validateEnv } from './env.validation';
import runtimeConfig from './runtime.config';
import storageConfig from './storage.config';
import shippingConfig from './shipping.config';
import paymentConfig from './payment.config';
import mailConfig from './mail.config';

export const configurations = [
  appConfig,
  authConfig,
  cookieConfig,
  databaseConfig,
  runtimeConfig,
  storageConfig,
  shippingConfig,
  paymentConfig,
  mailConfig,
];

export {
  appConfig,
  authConfig,
  cookieConfig,
  databaseConfig,
  runtimeConfig,
  storageConfig,
  shippingConfig,
  paymentConfig,
  mailConfig,
  validateEnv,
};
