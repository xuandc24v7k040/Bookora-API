import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import manifest from './model-files.json';
import type { WorkerRequest, WorkerResponse } from './ai.types';
import { buildSemanticDocument } from './semantic-document';
import { isValidVector } from './vector';

if (!process.send) throw new Error('Embedding worker requires parent IPC');
const send = (message: WorkerResponse): void => {
  process.send?.(message);
};
process.on('disconnect', () => process.exit(0));

async function start(): Promise<void> {
  const started = performance.now();
  const modelPath = process.argv[2];
  if (!modelPath) throw new Error('MODEL_PATH_REQUIRED');
  for (const entry of manifest.files) {
    const file = join(modelPath, entry.file);
    if ((await stat(file)).size !== entry.bytes) throw new Error('MODEL_SIZE');
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    if (hash.digest('hex') !== entry.sha256) throw new Error('MODEL_CHECKSUM');
  }
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  // A model provision step must supply every artifact. Runtime never downloads.
  globalThis.fetch = () =>
    Promise.reject(new Error('AI_REMOTE_ACCESS_DISABLED'));
  const model = await pipeline('feature-extraction', modelPath, {
    dtype: 'q8',
    device: 'cpu',
    local_files_only: true,
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
  });
  model.tokenizer.model_max_length = 512;
  const countTokens = (text: string): number =>
    Number(model.tokenizer(text, { truncation: false }).input_ids.data.length);
  await model('query: warmup', { pooling: 'mean', normalize: true });
  send({
    type: 'ready',
    loadMs: performance.now() - started,
  } satisfies WorkerResponse);
  let busy = false;
  process.on('message', (request: WorkerRequest) => {
    if (busy) {
      send({
        type: 'failure',
        id: request.id,
        reason: 'WORKER_CONCURRENCY',
      } satisfies WorkerResponse);
      return;
    }
    busy = true;
    void (async () => {
      const started = performance.now();
      try {
        const text =
          request.input.kind === 'query'
            ? `query: ${request.input.text}`
            : buildSemanticDocument(request.input.product, countTokens);
        const tokens = countTokens(text);
        if (tokens > 512) throw new Error('INPUT_TOKEN_LIMIT');
        const output = await model(text, { pooling: 'mean', normalize: true });
        const vector = Array.from(output.data, Number);
        if (!isValidVector(vector)) throw new Error('INVALID_VECTOR');
        send({
          type: 'result',
          id: request.id,
          vector,
          tokens,
          ms: performance.now() - started,
        } satisfies WorkerResponse);
      } catch {
        send({
          type: 'failure',
          id: request.id,
          reason: 'INFERENCE_FAILED',
        } satisfies WorkerResponse);
      } finally {
        busy = false;
      }
    })();
  });
}

void start().catch(() => {
  send({
    type: 'unavailable',
    reason: 'MODEL_UNAVAILABLE',
  } satisfies WorkerResponse);
});
