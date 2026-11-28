import { Module } from '@nestjs/common';
import { AiCatalogRepository } from './ai-catalog.repository';
import { EmbeddingService } from './embedding.service';
import { ProductVectorIndex } from './product-vector-index.service';
import { SemanticSearchService } from './semantic-search.service';

@Module({
  providers: [
    AiCatalogRepository,
    EmbeddingService,
    ProductVectorIndex,
    SemanticSearchService,
  ],
  exports: [
    AiCatalogRepository,
    EmbeddingService,
    ProductVectorIndex,
    SemanticSearchService,
  ],
})
export class AiModule {}
