import { defineConfig, env } from 'prisma/config';
import { config } from 'dotenv';

const nodeEnv = process.env.NODE_ENV?.trim();
const envFilePaths = nodeEnv
  ? [`.env.${nodeEnv}.local`, `.env.${nodeEnv}`, '.env']
  : ['.env'];

for (const path of envFilePaths) {
  config({ path, quiet: true });
}

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
