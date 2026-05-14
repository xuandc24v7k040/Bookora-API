import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'Exam API',
  port: Number(process.env.PORT ?? 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
}));
