import { registerAs } from '@nestjs/config';
import { getEnvNumber, getEnvString } from './env.utils';

export default registerAs('payment', () => ({
  vnpay: {
    environment: getEnvString('VNPAY_ENV'),
    tmnCode: getEnvString('VNPAY_TMN_CODE'),
    hashSecret: getEnvString('VNPAY_HASH_SECRET'),
    paymentUrl: getEnvString('VNPAY_PAYMENT_URL'),
    queryUrl: getEnvString('VNPAY_QUERY_URL'),
    returnUrl: getEnvString('VNPAY_RETURN_URL'),
    frontendResultUrl: getEnvString('VNPAY_FRONTEND_RESULT_URL'),
    ipnUrl: getEnvString('VNPAY_IPN_URL'),
    version: getEnvString('VNPAY_VERSION', '2.1.0'),
    command: getEnvString('VNPAY_COMMAND', 'pay'),
    currency: getEnvString('VNPAY_CURRENCY', 'VND'),
    locale: getEnvString('VNPAY_LOCALE', 'vn'),
    orderType: getEnvString('VNPAY_ORDER_TYPE', 'other'),
    expireMinutes: getEnvNumber('VNPAY_PAYMENT_EXPIRE_MINUTES', 15),
  },
}));
