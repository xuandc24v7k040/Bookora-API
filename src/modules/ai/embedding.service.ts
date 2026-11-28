import { join } from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DOCUMENT_DEADLINE_MS,
  INFERENCE_CAPACITY,
  INFERENCE_DEADLINE_MS,
  type EmbeddingInput,
  type ModelState,
  type WorkerResponse,
} from './ai.types';
import { isValidVector } from './vector';

interface Job {
  id: number;
  input: EmbeddingInput;
  resolve: (value: readonly number[] | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class EmbeddingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingService.name);
  readonly enabled: boolean;
  private state: ModelState = 'disabled';
  private worker?: ChildProcess;
  private initializationTimer?: ReturnType<typeof setTimeout>;
  private termination?: Promise<void>;
  private active?: Job;
  private readonly queue: Job[] = [];
  private sequence = 0;
  private readonly counts = {
    modelLoads: 0,
    queryInferences: 0,
    documentInferences: 0,
    rejected: 0,
    failures: 0,
    timeouts: 0,
    maximumInFlight: 0,
    loadMs: 0,
  };

  constructor(private readonly config: ConfigService) {
    this.enabled = config.get<boolean>('ai.semanticSearchEnabled') ?? false;
  }

  get ready(): boolean {
    return this.state === 'ready';
  }

  diagnostics() {
    return {
      state: this.state,
      ...this.counts,
      active: Boolean(this.active),
      queued: this.queue.length,
      capacity: INFERENCE_CAPACITY,
      deadlineMs: INFERENCE_DEADLINE_MS,
      documentDeadlineMs: DOCUMENT_DEADLINE_MS,
    };
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.state = 'loading';
    this.counts.modelLoads++;
    try {
      // Isolate native ONNX cancellation/crashes from the Commerce process.
      const worker = fork(
        join(__dirname, 'embedding.worker.js'),
        [this.config.getOrThrow<string>('ai.modelPath')],
        {
          execArgv: [],
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        },
      );
      this.worker = worker;
      this.termination = new Promise((resolve) => worker.once('exit', resolve));
      worker.unref();
      worker.on('message', (message: WorkerResponse) => this.receive(message));
      worker.on('error', () => this.unavailable('worker-error'));
      worker.on('exit', () => {
        if (this.state !== 'disabled' && this.state !== 'unavailable')
          this.unavailable('worker-exit');
      });
      this.initializationTimer = setTimeout(
        () => this.unavailable('initialization-timeout'),
        15_000,
      );
      this.initializationTimer.unref();
    } catch {
      this.unavailable('initialization-failed');
    }
  }

  embed(input: EmbeddingInput): Promise<readonly number[] | null> {
    if (!this.ready) return Promise.resolve(null);
    if (
      this.queue.length + Number(Boolean(this.active)) >=
      INFERENCE_CAPACITY
    ) {
      this.counts.rejected++;
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const id = ++this.sequence;
      const timer = setTimeout(
        () => {
          this.counts.timeouts++;
          // Terminate the owning worker; timed-out native work cannot accumulate.
          this.unavailable('inference-timeout');
        },
        input.kind === 'document'
          ? DOCUMENT_DEADLINE_MS
          : INFERENCE_DEADLINE_MS,
      );
      this.queue.push({ id, input, resolve, timer });
      this.counts.maximumInFlight = Math.max(
        this.counts.maximumInFlight,
        this.queue.length + Number(Boolean(this.active)),
      );
      this.pump();
    });
  }

  private pump(): void {
    if (this.active || !this.ready) return;
    const job = this.queue.shift();
    if (!job) return;
    this.active = job;
    if (job.input.kind === 'query') this.counts.queryInferences++;
    else this.counts.documentInferences++;
    this.worker?.send({ id: job.id, input: job.input }, (error) => {
      if (error) this.unavailable('worker-send-failed');
    });
  }

  private receive(message: WorkerResponse): void {
    if (message.type === 'ready') {
      if (this.state !== 'loading') return;
      clearTimeout(this.initializationTimer);
      this.counts.loadMs = message.loadMs;
      this.state = 'ready';
      return;
    }
    if (message.type === 'unavailable' || message.type === 'failure') {
      this.unavailable('model-failed');
      return;
    }
    const job = this.active;
    if (!job || message.id !== job.id) return;
    if (!isValidVector(message.vector)) {
      this.unavailable('invalid-vector');
      return;
    }
    clearTimeout(job.timer);
    this.active = undefined;
    job.resolve(Object.freeze(message.vector));
    this.pump();
  }

  private unavailable(reason: string): void {
    if (this.state === 'unavailable' || this.state === 'disabled') return;
    this.state = 'unavailable';
    this.counts.failures++;
    clearTimeout(this.initializationTimer);
    const jobs = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = undefined;
    this.queue.length = 0;
    for (const job of jobs) {
      clearTimeout(job.timer);
      job.resolve(null);
    }
    this.worker?.kill('SIGKILL');
    this.logger.warn(
      `Local embedding unavailable (${reason}); using keyword search.`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.state !== 'disabled') this.unavailable('shutdown');
    this.state = 'disabled';
    if (this.termination) await this.termination.catch(() => undefined);
  }
}
