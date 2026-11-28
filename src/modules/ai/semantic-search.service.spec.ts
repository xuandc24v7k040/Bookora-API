import {
  SemanticSearchService,
  semanticQueryEligible,
} from './semantic-search.service';
import type { AiCatalogRepository } from './ai-catalog.repository';
import type { EmbeddingService } from './embedding.service';
import type { ProductVectorIndex } from './product-vector-index.service';

describe('hybrid eligibility and legitimate error semantics', () => {
  it('protects exact/strong SQL and nonexistent identifiers, retaining meaningful short needs', () => {
    for (const rank of [0, 1, 2, 3, 5, 6])
      expect(
        semanticQueryEligible('nhu cầu', [{ id: 'one', matchRank: rank }]),
      ).toBe(false);
    expect(
      semanticQueryEligible('nhu cầu mới', [{ id: 'one', matchRank: 7 }]),
    ).toBe(true);
    expect(semanticQueryEligible('9789999999999', [])).toBe(false);
    expect(semanticQueryEligible('MISSING-SKU', [])).toBe(false);
    expect(semanticQueryEligible('thất tình', [])).toBe(true);
    expect(semanticQueryEligible('sách', [])).toBe(false);
  });

  it('does no projection work when disabled/unavailable or an exact match is protected', async () => {
    const catalog = { list: jest.fn() };
    const embeddings = { enabled: false, ready: false, embed: jest.fn() };
    const service = new SemanticSearchService(
      catalog as unknown as AiCatalogRepository,
      embeddings as unknown as EmbeddingService,
      {} as ProductVectorIndex,
    );
    await expect(service.search('nhu cầu', [])).resolves.toBeNull();
    embeddings.enabled = true;
    await expect(service.search('nhu cầu', [])).resolves.toBeNull();
    embeddings.ready = true;
    await expect(
      service.search('tên chính xác', [{ id: 'one', matchRank: 1 }]),
    ).resolves.toBeNull();
    expect(catalog.list).not.toHaveBeenCalled();
    expect(embeddings.embed).not.toHaveBeenCalled();
  });

  it('does not mask DB failures as a successful keyword/empty fallback', async () => {
    const failure = new Error('database unavailable');
    const catalog = { list: jest.fn().mockRejectedValue(failure) };
    const service = new SemanticSearchService(
      catalog as unknown as AiCatalogRepository,
      { enabled: true, ready: true } as EmbeddingService,
      { beginRead: () => 1 } as ProductVectorIndex,
    );
    await expect(service.search('nhu cầu', [])).rejects.toBe(failure);
  });

  it('uses SQL during a repair without repeatedly scanning metadata or queueing queries', async () => {
    const catalog = { list: jest.fn() };
    const embeddings = { enabled: true, ready: true, embed: jest.fn() };
    const index = { building: true, beginRead: jest.fn() };
    const service = new SemanticSearchService(
      catalog as unknown as AiCatalogRepository,
      embeddings as unknown as EmbeddingService,
      index as unknown as ProductVectorIndex,
    );
    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.search('nhu cầu', [])),
    );
    expect(results.every((result) => result === null)).toBe(true);
    expect(catalog.list).not.toHaveBeenCalled();
    expect(index.beginRead).not.toHaveBeenCalled();
    expect(embeddings.embed).not.toHaveBeenCalled();
  });
});
