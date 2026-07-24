import { registerAs } from '@nestjs/config';
import { getEnvNumber, getEnvString } from './env.utils';

export default registerAs('shipping', () => ({
  ghn: {
    baseUrl: getEnvString('GHN_BASE_URL'),
    token: getEnvString('GHN_TOKEN'),
    shopId: getEnvNumber('GHN_SHOP_ID', 0),
    clientId: getEnvString('GHN_CLIENT_ID', ''),
    timeoutMs: getEnvNumber('GHN_TIMEOUT_MS', 8_000),
    defaultItemWeightGrams: getEnvNumber('GHN_DEFAULT_ITEM_WEIGHT_GRAMS', 500),
    defaultPackageLengthCm: getEnvNumber('GHN_DEFAULT_PACKAGE_LENGTH_CM', 20),
    defaultPackageWidthCm: getEnvNumber('GHN_DEFAULT_PACKAGE_WIDTH_CM', 15),
    defaultPackageHeightCm: getEnvNumber('GHN_DEFAULT_PACKAGE_HEIGHT_CM', 5),
  },
}));
