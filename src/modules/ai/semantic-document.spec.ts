import { buildSemanticDocument, productFingerprint } from './semantic-document';
import { cosine, isValidVector } from './vector';
import type { SemanticProduct } from './ai.types';

const product: SemanticProduct = {
  id: 'public-product',
  name: 'Một sản phẩm thật',
  shortDescription: 'Nội dung mô tả ngắn có ý nghĩa.',
  description:
    '<p>Nội dung sản phẩm mô tả nhu cầu của người đọc và các chủ đề cụ thể.</p>',
  authors: ['Tác giả B', 'Tác giả A'],
  categories: ['Danh mục con', 'Danh mục cha'],
  publisher: 'Nhà xuất bản',
};

describe('semantic source identity and vector invariants', () => {
  it('is stable across relation order and duplicate categories', () => {
    expect(
      productFingerprint({
        ...product,
        authors: [...product.authors].reverse(),
        categories: [...product.categories]
          .reverse()
          .concat(product.categories[0]),
      }),
    ).toBe(productFingerprint(product));
  });

  it('invalidates paragraph changes that can alter extractive selection', () => {
    const separated = {
      ...product,
      description:
        '<p>First short paragraph.</p><p>Second short paragraph.</p>',
    };
    const joined = {
      ...product,
      description: '<p>First short paragraph.Second short paragraph.</p>',
    };
    expect(productFingerprint(separated)).not.toBe(productFingerprint(joined));
  });

  it.each([
    { name: 'Tên mới' },
    { shortDescription: 'Nội dung ngắn mới' },
    { description: '<p>Nội dung mới</p>' },
    { authors: ['Tác giả đổi tên'] },
    { categories: ['Danh mục cha đổi tên'] },
    { publisher: 'Nhà xuất bản đổi tên' },
  ])(
    'detects content/relation change independently of Product.updatedAt: %j',
    (change) => {
      expect(productFingerprint({ ...product, ...change })).not.toBe(
        productFingerprint(product),
      );
    },
  );

  it('ignores volatile fields outside the semantic projection', () => {
    const priceOnly = { ...product, price: 1000, rating: 5, stock: 0 };
    expect(productFingerprint(priceOnly)).toBe(productFingerprint(product));
  });

  it('uses extractive text and respects an actual-token counter budget', () => {
    const input = buildSemanticDocument(
      {
        ...product,
        description: '<p>' + 'Thông tin thật. '.repeat(1000) + '</p>',
      },
      (text) => text.length + 2,
    );
    expect(input.startsWith('passage: ')).toBe(true);
    expect(input.length + 2).toBeLessThanOrEqual(512);
    expect(input).not.toContain('<p>');
  });

  it('handles missing content and rejects invalid vectors', () => {
    expect(
      buildSemanticDocument(
        { ...product, description: null, shortDescription: null },
        (text) => text.length + 2,
      ),
    ).toContain(product.name);
    const valid = Array.from({ length: 384 }, (_, index) =>
      Number(index === 0),
    );
    expect(isValidVector(valid)).toBe(true);
    expect(cosine(valid, valid)).toBe(1);
    expect(isValidVector([1])).toBe(false);
    expect(isValidVector(Array(384).fill(0) as number[])).toBe(false);
    expect(isValidVector([...valid.slice(1), NaN])).toBe(false);
  });
});
