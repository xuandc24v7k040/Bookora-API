import { registerAs } from '@nestjs/config';
import { getEnvNumber, getEnvString } from './env.utils';

export default registerAs('storage', () => ({
  provider: getEnvString('STORAGE_PROVIDER', 'r2'),
  endpoint: getEnvString('R2_ENDPOINT'),
  region: getEnvString('R2_REGION', 'auto'),
  accessKeyId: getEnvString('R2_ACCESS_KEY_ID'),
  secretAccessKey: getEnvString('R2_SECRET_ACCESS_KEY'),
  publicBucket: getEnvString('R2_PUBLIC_BUCKET', 'bookora-public'),
  privateBucket: getEnvString('R2_PRIVATE_BUCKET', 'bookora'),
  publicBaseUrl: getEnvString('R2_PUBLIC_BASE_URL').replace(/\/+$/, ''),
  image: {
    maxBytes: getEnvNumber('IMAGE_UPLOAD_MAX_BYTES', 5 * 1024 * 1024),
    maxWidth: getEnvNumber('IMAGE_MAX_WIDTH', 2400),
    maxHeight: getEnvNumber('IMAGE_MAX_HEIGHT', 2400),
    webpQuality: getEnvNumber('IMAGE_WEBP_QUALITY', 82),
  },
}));
