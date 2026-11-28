import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { AiCatalogRepository } from './ai-catalog.repository';
import { EmbeddingService } from './embedding.service';
import type { ProductVector, SemanticProduct } from './ai.types';
import { productFingerprint } from './semantic-document';

interface DesiredProduct {
  product: SemanticProduct;
  fingerprint: string;
}

@Injectable()
export class ProductVectorIndex implements OnModuleDestroy {
  private readonly logger = new Logger(ProductVectorIndex.name);
  private readonly vectors = new Map<string, ProductVector>();
  private desired = new Map<string, DesiredProduct>();
  private sequence = 0;
  private appliedRead = 0;
  private repairing = false;
  private stopped = false;
  private warned = false;
  private published = 0;
  private staleCompletions = 0;

  constructor(
    private readonly catalog: AiCatalogRepository,
    private readonly embeddings: EmbeddingService,
  ) {}

  beginRead(): number {
    return ++this.sequence;
  }

  get building(): boolean {
    return this.repairing;
  }

  reconcile(products: readonly SemanticProduct[], read: number): boolean {
    if (read < this.appliedRead || this.stopped) return false;
    this.appliedRead = read;
    this.desired = new Map(
      products.map((product) => [
        product.id,
        { product, fingerprint: productFingerprint(product) },
      ]),
    );
    for (const [id, vector] of this.vectors)
      if (this.desired.get(id)?.fingerprint !== vector.fingerprint)
        this.vectors.delete(id);
    this.repair();
    return true;
  }

  /** Returns only vectors matching this committed projection, never stale IDs. */
  snapshot(products: readonly SemanticProduct[]): readonly ProductVector[] {
    return products.flatMap((product) => {
      const vector = this.vectors.get(product.id);
      return vector?.fingerprint === productFingerprint(product)
        ? [vector]
        : [];
    });
  }

  diagnostics() {
    return {
      products: this.desired.size,
      validVectors: this.vectors.size,
      repairing: this.repairing,
      published: this.published,
      staleCompletions: this.staleCompletions,
      fingerprints: [...this.vectors.values()].map(({ id, fingerprint }) => ({
        id,
        fingerprint,
      })),
    };
  }

  private repair(): void {
    if (this.repairing || this.stopped || !this.embeddings.ready) return;
    const batch = [...this.desired.values()].filter(
      ({ product, fingerprint }) =>
        this.vectors.get(product.id)?.fingerprint !== fingerprint,
    );
    if (!batch.length) return;
    const read = this.appliedRead;
    this.repairing = true;
    void (async () => {
      try {
        for (const entry of batch) {
          if (this.stopped || !this.embeddings.ready) break;
          if (
            this.desired.get(entry.product.id)?.fingerprint !==
            entry.fingerprint
          )
            continue;
          const vector = await this.embeddings.embed({
            kind: 'document',
            product: entry.product,
          });
          if (!vector || this.stopped) break;
          // Verify committed content/visibility again before publishing completion.
          const current = await this.catalog.find(entry.product.id);
          if (
            !current ||
            productFingerprint(current) !== entry.fingerprint ||
            this.desired.get(entry.product.id)?.fingerprint !==
              entry.fingerprint
          ) {
            this.staleCompletions++;
            continue;
          }
          this.vectors.set(
            entry.product.id,
            Object.freeze({
              id: entry.product.id,
              fingerprint: entry.fingerprint,
              vector,
            }),
          );
          this.published++;
        }
      } catch {
        // DB failures in foreground reads still propagate; repair never breaks CRUD.
        if (!this.warned) {
          this.warned = true;
          this.logger.warn(
            'Product embedding repair deferred until a fresh read.',
          );
        }
      } finally {
        this.repairing = false;
        if (read !== this.appliedRead && !this.stopped) this.repair();
      }
    })();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    this.desired.clear();
    this.vectors.clear();
  }
}
