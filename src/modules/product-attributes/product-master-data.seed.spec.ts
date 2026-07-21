import { PRODUCT_MASTER_DATA_SNAPSHOT } from '../../../prisma/seed/product-master-data.seed';
import { toSlug } from '@/common/utils/slug.util';
describe('PRODUCT_MASTER_DATA_SNAPSHOT', () => {
  it('contains the exact unique Vietnamese seed snapshot and every attribute type', () => {
    expect(PRODUCT_MASTER_DATA_SNAPSHOT.suppliers).toHaveLength(5);
    expect(PRODUCT_MASTER_DATA_SNAPSHOT.publishers).toHaveLength(8);
    expect(PRODUCT_MASTER_DATA_SNAPSHOT.authors).toHaveLength(12);
    expect(PRODUCT_MASTER_DATA_SNAPSHOT.attributes).toHaveLength(10);
    const slugs = [
      ...PRODUCT_MASTER_DATA_SNAPSHOT.suppliers,
      ...PRODUCT_MASTER_DATA_SNAPSHOT.publishers,
      ...PRODUCT_MASTER_DATA_SNAPSHOT.authors,
    ].map((x) => toSlug(x.name));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(
      new Set(PRODUCT_MASTER_DATA_SNAPSHOT.attributes.map((x) => x.type)).size,
    ).toBe(6);
  });
});
