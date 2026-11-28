import { ProductVectorIndex } from './product-vector-index.service';
import type { AiCatalogRepository } from './ai-catalog.repository';
import type { EmbeddingService } from './embedding.service';
import type { SemanticProduct } from './ai.types';
import { productFingerprint } from './semantic-document';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function until(check: () => boolean): Promise<void> {
  for (let count = 0; count < 30; count++) {
    if (check()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('Background repair did not settle');
}
const source: SemanticProduct = {
  id: 'one',
  name: 'Sách',
  shortDescription: 'Nội dung gốc',
  description: null,
  authors: [],
  categories: ['Chủ đề'],
  publisher: null,
};
const vector: readonly number[] = Object.freeze(
  Array.from({ length: 384 }, (_, index) => Number(index === 0)),
);

describe('committed product vector snapshots', () => {
  it('rejects a late old embedding, then publishes only the new fingerprint', async () => {
    const old = deferred<readonly number[] | null>();
    const changed = { ...source, shortDescription: 'Nội dung đã commit mới' };
    const catalog = { find: jest.fn().mockResolvedValue(changed) };
    const embeddings = {
      ready: true,
      embed: jest
        .fn()
        .mockImplementationOnce(() => old.promise)
        .mockResolvedValue(vector),
    };
    const index = new ProductVectorIndex(
      catalog as unknown as AiCatalogRepository,
      embeddings as unknown as EmbeddingService,
    );
    index.reconcile([source], index.beginRead());
    index.reconcile([changed], index.beginRead());
    expect(index.snapshot([changed])).toHaveLength(0);
    old.resolve(vector);
    await until(() => index.snapshot([changed]).length === 1);
    expect(index.snapshot([source])).toHaveLength(0);
    expect(index.snapshot([changed])[0].fingerprint).toBe(
      productFingerprint(changed),
    );
    expect(index.diagnostics().staleCompletions).toBe(1);
    expect(embeddings.embed).toHaveBeenCalledTimes(2);
    index.onModuleDestroy();
  });

  it('does not let a slower earlier projection overwrite a newer read or leak removed IDs', async () => {
    const catalog = { find: jest.fn().mockResolvedValue(source) };
    const embeddings = {
      ready: true,
      embed: jest.fn().mockResolvedValue(vector),
    };
    const index = new ProductVectorIndex(
      catalog as unknown as AiCatalogRepository,
      embeddings as unknown as EmbeddingService,
    );
    const earlier = index.beginRead();
    index.reconcile([source], index.beginRead());
    await until(() => index.snapshot([source]).length === 1);
    expect(index.reconcile([], earlier)).toBe(false);
    for (let count = 0; count < 10; count++)
      index.reconcile([source], index.beginRead());
    expect(embeddings.embed).toHaveBeenCalledTimes(1);
    index.reconcile([], index.beginRead());
    expect(index.snapshot([source])).toHaveLength(0);
    index.onModuleDestroy();
  });

  it('never publishes a document hidden/deleted after inference started', async () => {
    const pending = deferred<readonly number[] | null>();
    const catalog = { find: jest.fn().mockResolvedValue(null) };
    const embeddings = {
      ready: true,
      embed: jest.fn().mockReturnValue(pending.promise),
    };
    const index = new ProductVectorIndex(
      catalog as unknown as AiCatalogRepository,
      embeddings as unknown as EmbeddingService,
    );
    index.reconcile([source], index.beginRead());
    pending.resolve(vector);
    await until(() => !index.diagnostics().repairing);
    expect(index.snapshot([source])).toHaveLength(0);
    index.onModuleDestroy();
  });
});
