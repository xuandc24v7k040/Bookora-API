import {
  buildCategorySlug,
  buildCategorySlugReconciliationPlan,
  CategorySlugReconciliationError,
  type CategorySlugRecord,
} from './category-slug.util';

describe('category slug policy', () => {
  it('builds root and child slugs from the effective scope', () => {
    expect(buildCategorySlug('Kinh tế')).toBe('kinh-te');
    expect(buildCategorySlug('Kinh tế', 'Tiểu sử - Hồi ký')).toBe(
      'tieu-su-hoi-ky-kinh-te',
    );
  });

  it('plans roots before children and is idempotent after apply', () => {
    const records: CategorySlugRecord[] = [
      {
        id: ROOT_CHILD,
        name: 'Kinh tế',
        slug: 'kinh-te-2',
        parentId: ROOT_PARENT,
      },
      {
        id: ROOT_PARENT,
        name: 'Tiểu sử - Hồi ký',
        slug: 'old-root',
        parentId: null,
      },
    ];
    const firstPlan = buildCategorySlugReconciliationPlan(records);

    expect(firstPlan.map(({ id, nextSlug }) => ({ id, nextSlug }))).toEqual([
      { id: ROOT_PARENT, nextSlug: 'tieu-su-hoi-ky' },
      { id: ROOT_CHILD, nextSlug: 'tieu-su-hoi-ky-kinh-te' },
    ]);

    const reconciled = records.map((record) => ({
      ...record,
      slug:
        firstPlan.find((change) => change.id === record.id)?.nextSlug ??
        record.slug,
    }));
    expect(buildCategorySlugReconciliationPlan(reconciled)).toEqual([]);
  });

  it('fails clearly with every record in an unresolvable conflict', () => {
    const records: CategorySlugRecord[] = [
      { id: ROOT_PARENT, name: 'A-B', slug: 'root-old', parentId: null },
      { id: ROOT_CHILD, name: 'B', slug: 'child-old', parentId: ROOT_OTHER },
      { id: ROOT_OTHER, name: 'A', slug: 'other-old', parentId: null },
    ];

    let caught: unknown;
    try {
      buildCategorySlugReconciliationPlan(records);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CategorySlugReconciliationError);
    expect((caught as CategorySlugReconciliationError).conflicts).toEqual([
      {
        slug: 'a-b',
        records: expect.arrayContaining([
          expect.objectContaining({ id: ROOT_PARENT }),
          expect.objectContaining({ id: ROOT_CHILD }),
        ]),
      },
    ]);
  });
});

const ROOT_PARENT = '01J00000000000000000000001';
const ROOT_CHILD = '01J00000000000000000000002';
const ROOT_OTHER = '01J00000000000000000000003';
