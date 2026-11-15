import { StorefrontCatalogRepository } from './storefront-catalog.repository';

describe('StorefrontCatalogRepository search ranking', () => {
  it('separates complete title words and phrases from arbitrary substrings', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      { id: 'word-match', matchRank: 3, isBestSeller: false },
      { id: 'substring-match', matchRank: 4, isBestSeller: false },
      { id: 'author-match', matchRank: 5, isBestSeller: false },
      { id: 'publisher-match', matchRank: 6, isBestSeller: false },
      { id: 'fuzzy-match', matchRank: 7, isBestSeller: false },
    ]);
    const repository = new StorefrontCatalogRepository({
      $queryRaw: queryRaw,
    } as never);

    const matches = await repository['searchProductMatches']('hai huoc');

    expect(matches).toEqual([
      { id: 'word-match', isBestMatch: true, isBestSeller: false },
      { id: 'substring-match', isBestMatch: false, isBestSeller: false },
      { id: 'author-match', isBestMatch: false, isBestSeller: false },
      { id: 'publisher-match', isBestMatch: false, isBestSeller: false },
      { id: 'fuzzy-match', isBestMatch: false, isBestSeller: false },
    ]);

    const sql = queryRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    const source = sql.strings.join('?');

    expect(source).toContain(
      'regexp_replace(\n                public.bookora_normalize_search(p.name)',
    );
    expect(source).toContain("'[^[:alnum:]]+'");
    expect(source).toContain("' ' || query.word_value || ' '");
    expect(source).toContain(') > 0 THEN 3');
    expect(source).toContain(') > 0 THEN 4');
    expect(source).toContain(') THEN 5');
    expect(source).toContain(') > 0 THEN 6');
    expect(source).toContain('ELSE 7');
    expect(sql.values).toEqual(['hai huoc']);
  });
});

describe('StorefrontCatalogRepository related products', () => {
  it('uses parameterized structured scoring, deterministic tie-breaks and tiered fallback', async () => {
    const productId = '01J00000000000000000000000';
    const relatedId = '01J00000000000000000000001';
    const now = new Date('2026-08-10T00:00:00.000Z');
    const queryRaw = jest.fn().mockResolvedValue([{ candidateId: relatedId }]);
    const repository = new StorefrontCatalogRepository({
      $queryRaw: queryRaw,
    } as never);

    await expect(
      repository.listRelatedProductIds(productId, 3, now),
    ).resolves.toEqual([relatedId]);

    const sql = queryRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    const source = sql.strings.join('?');

    expect(source).toContain('WITH current_product AS');
    expect(source).toContain('candidate_scores AS');
    expect(source).toContain('UNION ALL');
    expect(source).toContain('SUM(score)::int AS relevance_score');
    expect(source).toContain('ROW_NUMBER() OVER');
    expect(source).toContain('5 AS score');
    expect(source).toContain('4 AS score');
    expect(source).toContain('3 AS score');
    expect(source).toContain('2 AS score');
    expect(source).toContain('1 AS score');
    expect(source).toContain("candidate.status = 'ACTIVE'");
    expect(source).toContain("completed_order.status = 'COMPLETED'");
    expect(source).toContain('review.is_visible = true');
    expect(source).toContain('candidate.id <> current_product.id');
    expect(source).toContain('bestseller_selected AS');
    expect(source).toContain('newest_selected AS');
    expect(source).toContain('scored.relevance_score DESC');
    expect(source).toContain('candidate_pool.sold_quantity DESC');
    expect(source).toContain('candidate_pool.average_rating DESC');
    expect(source).toContain('candidate_pool.created_at DESC');
    expect(source).toContain('candidate_pool.candidate_id ASC');
    expect(source).not.toContain(productId);
    expect(sql.values).toContain(productId);
    expect(sql.values).toContain(now);
    expect(sql.values).toContain(3);
  });

  it('reuses the canonical public visibility filter before ranking', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new StorefrontCatalogRepository({
      product: { findFirst },
    } as never);

    await repository.findPublicProductId('01J00000000000000000000000');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          variants: { some: { isActive: true, isDefault: true } },
        }),
        select: { id: true },
      }),
    );
  });
});
