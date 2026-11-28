import { resolve } from 'node:path';
import { registerAs } from '@nestjs/config';
import { getEnvBoolean, getEnvString } from './env.utils';

export default registerAs('ai', () => ({
  semanticSearchEnabled: getEnvBoolean('SEMANTIC_SEARCH_ENABLED', false),
  modelPath: resolve(getEnvString('AI_MODEL_PATH', '.local-models/e5-small')),
}));
