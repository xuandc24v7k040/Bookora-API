import { EventEmitter } from 'node:events';
import { fork, type ChildProcess } from 'node:child_process';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

jest.mock('node:child_process', () => ({ fork: jest.fn() }));

class FakeWorker extends EventEmitter {
  send = jest.fn();
  unref = jest.fn();
  kill = jest.fn(() => {
    this.emit('exit', null, 'SIGKILL');
    return true;
  });
}
function config(enabled: boolean): ConfigService {
  return {
    get: (key: string) =>
      key === 'ai.semanticSearchEnabled' ? enabled : 'missing-local-model',
    getOrThrow: () => 'missing-local-model',
  } as unknown as ConfigService;
}

describe('local model lifecycle and backpressure', () => {
  let worker: FakeWorker;
  beforeEach(() => {
    worker = new FakeWorker();
    jest
      .mocked(fork)
      .mockImplementation(() => worker as unknown as ChildProcess);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('does not initialize a disabled model', async () => {
    const service = new EmbeddingService(config(false));
    service.onModuleInit();
    expect(fork).not.toHaveBeenCalled();
    await expect(
      service.embed({ kind: 'query', text: 'nhu cầu' }),
    ).resolves.toBeNull();
    await service.onModuleDestroy();
  });

  it('caps active+queued work and drains in FIFO order without duplicate initialization', async () => {
    const service = new EmbeddingService(config(true));
    service.onModuleInit();
    worker.emit('message', { type: 'ready', loadMs: 12 });
    const requests = Array.from({ length: 20 }, () =>
      service.embed({ kind: 'query', text: 'nhu cầu' }),
    );
    for (let id = 1; id <= 5; id++)
      worker.emit('message', {
        type: 'result',
        id,
        vector: Array.from({ length: 384 }, (_, index) => Number(index === 0)),
        tokens: 4,
        ms: 1,
      });
    const results = await Promise.all(requests);
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(service.diagnostics().rejected).toBe(15);
    expect(service.diagnostics().maximumInFlight).toBe(5);
    expect(worker.send).toHaveBeenCalledTimes(5);
    expect(fork).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('counts queue waiting in the deadline and terminates native work on timeout', async () => {
    jest.useFakeTimers();
    const service = new EmbeddingService(config(true));
    service.onModuleInit();
    worker.emit('message', { type: 'ready', loadMs: 1 });
    const first = service.embed({ kind: 'query', text: 'A' });
    const queued = service.embed({ kind: 'query', text: 'B' });
    jest.advanceTimersByTime(1001);
    await expect(first).resolves.toBeNull();
    await expect(queued).resolves.toBeNull();
    expect(worker.kill).toHaveBeenCalledWith('SIGKILL');
    expect(service.diagnostics().state).toBe('unavailable');
    expect(service.diagnostics().active).toBe(false);
    await expect(
      service.embed({ kind: 'query', text: 'C' }),
    ).resolves.toBeNull();
    expect(fork).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('rejects corrupt vectors and model failure without throwing into a request', async () => {
    const service = new EmbeddingService(config(true));
    service.onModuleInit();
    worker.emit('message', { type: 'ready', loadMs: 1 });
    const pending = service.embed({ kind: 'query', text: 'A' });
    worker.emit('message', {
      type: 'result',
      id: 1,
      vector: [NaN],
      tokens: 1,
      ms: 1,
    });
    await expect(pending).resolves.toBeNull();
    expect(service.diagnostics().failures).toBe(1);
    await service.onModuleDestroy();
  });

  it('bounds background document work separately from the interactive query deadline', async () => {
    jest.useFakeTimers();
    const service = new EmbeddingService(config(true));
    service.onModuleInit();
    worker.emit('message', { type: 'ready', loadMs: 1 });
    const pending = service.embed({
      kind: 'document',
      product: {
        id: 'qa-document',
        name: 'QA document',
        shortDescription: null,
        description: null,
        authors: [],
        categories: [],
        publisher: null,
      },
    });
    jest.advanceTimersByTime(1001);
    expect(service.diagnostics().state).toBe('ready');
    expect(worker.kill).not.toHaveBeenCalled();
    jest.advanceTimersByTime(4000);
    await expect(pending).resolves.toBeNull();
    expect(worker.kill).toHaveBeenCalledWith('SIGKILL');
    await service.onModuleDestroy();
  });
});
