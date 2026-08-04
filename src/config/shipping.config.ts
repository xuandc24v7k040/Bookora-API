import { registerAs } from '@nestjs/config';
import { getEnvNumber, getEnvString } from './env.utils';

export default registerAs('shipping', () => ({
  locationProof: {
    secret: getEnvString('CHECKOUT_LOCATION_PROOF_SECRET'),
    ttlSeconds: getEnvNumber('CHECKOUT_LOCATION_PROOF_TTL_SECONDS', 600),
  },
}));
