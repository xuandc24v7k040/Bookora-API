import { Injectable } from '@nestjs/common';
import { AiCatalogRepository } from './ai-catalog.repository';
import { EmbeddingService } from './embedding.service';
import { ProductVectorIndex } from './product-vector-index.service';
import { SEMANTIC_THRESHOLD } from './ai.types';
import { productFingerprint } from './semantic-document';
import { cosine } from './vector';

export interface LexicalCandidate {
  id: string;
  matchRank?: number;
}

const QUERY_STOPWORDS = new Set(
  'va la cua cho nhung cac mot toi minh ban muon can tim sach cuon san pham ve de voi theo co trong nhu hay the nao gi duoc tu khi thi the va an the a of to in for with about book books passage query'.split(
    ' ',
  ),
);

export function semanticQueryEligible(
  query: string,
  matches: readonly LexicalCandidate[],
): boolean {
  if (
    matches.some(
      ({ matchRank }) =>
        matchRank !== undefined &&
        (matchRank <= 3 || matchRank === 5 || matchRank === 6),
    )
  )
    return false;
  if (/^\d[\d\s-]*$/u.test(query)) return false;
  if (/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+$/u.test(query)) return false;
  return query
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .split(' ')
    .some((token) => token.length >= 2 && !QUERY_STOPWORDS.has(token));
}

@Injectable()
export class SemanticSearchService {
  constructor(
    private readonly catalog: AiCatalogRepository,
    private readonly embeddings: EmbeddingService,
    private readonly index: ProductVectorIndex,
  ) {}

  get enabled(): boolean {
    return this.embeddings.enabled;
  }

  async search(
    query: string,
    lexical: readonly LexicalCandidate[],
  ): Promise<string[] | null> {
    if (
      !this.enabled ||
      !this.embeddings.ready ||
      this.index.building ||
      !semanticQueryEligible(query, lexical)
    )
      return null;
    const read = this.index.beginRead();
    // DB errors deliberately stay outside the model-only fallback path.
    const products = await this.catalog.list();
    if (!this.index.reconcile(products, read)) return null;
    const snapshot = this.index.snapshot(products);
    if (!snapshot.length || snapshot.length !== products.length) return null;
    const vector = await this.embeddings.embed({
      kind: 'query',
      text: query.normalize('NFC').trim().replace(/\s+/gu, ' '),
    });
    if (!vector) return null;
    const confirmationRead = this.index.beginRead();
    const current = await this.catalog.list();
    const fingerprints = new Map(
      current.map((product) => [product.id, productFingerprint(product)]),
    );
    if (
      current.length !== snapshot.length ||
      snapshot.some((item) => fingerprints.get(item.id) !== item.fingerprint)
    ) {
      this.index.reconcile(current, confirmationRead);
      return null;
    }
    const semantic = snapshot
      .map((item) => ({ id: item.id, score: cosine(vector, item.vector) }))
      .filter((item) => item.score >= SEMANTIC_THRESHOLD)
      .sort(
        (left, right) =>
          right.score - left.score ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      );
    if (!semantic.length) return null;
    return [
      ...new Set([
        ...semantic.map(({ id }) => id),
        ...lexical.map(({ id }) => id),
      ]),
    ];
  }
}
