import { CATEGORY_SEED_TREE } from '../../../prisma/seed/categories.seed';
import { buildCategorySlug } from './category-slug.util';

describe('CATEGORY_SEED_TREE', () => {
  it('keeps the authoritative 8 roots and 32 children with unique slugs', () => {
    const roots = CATEGORY_SEED_TREE.length;
    const children = CATEGORY_SEED_TREE.reduce(
      (total, root) => total + root.children.length,
      0,
    );
    const slugs = CATEGORY_SEED_TREE.flatMap((root) => [
      buildCategorySlug(root.name),
      ...root.children.map((child) => buildCategorySlug(child, root.name)),
    ]);

    expect(roots).toBe(8);
    expect(children).toBe(32);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
