import { registerAs } from '@nestjs/config';
import { getEnvNumber, getEnvString } from './env.utils';

export default registerAs('mail', () => ({
  resendApiKey: getEnvString('RESEND_API_KEY'),
  from: getEnvString('MAIL_FROM'),
  passwordReset: {
    tokenHashSecret: getEnvString('PASSWORD_RESET_TOKEN_HASH_SECRET'),
    ttlMinutes: getEnvNumber('PASSWORD_RESET_TTL_MINUTES', 15),
  },
}));
