import { createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import {
  AI_DOCUMENT_VERSION,
  AI_MODEL_REVISION,
  type SemanticProduct,
} from './ai.types';

export function cleanSemanticText(value: string | null): string {
  return sanitizeHtml(value ?? '', { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/gu, '&')
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function productFingerprint(product: SemanticProduct): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        AI_MODEL_REVISION,
        AI_DOCUMENT_VERSION,
        'q8:mean:l2:512:query/passage',
        product.id,
        cleanSemanticText(product.name),
        cleanSemanticText(product.shortDescription),
        // Paragraph boundaries affect extractive selection, even when stripping
        // markup would produce the same text. Include the complete source.
        product.description?.normalize('NFC') ?? '',
        product.authors.map(cleanSemanticText).sort(),
        [...new Set(product.categories.map(cleanSemanticText))].sort(),
        cleanSemanticText(product.publisher),
      ]),
    )
    .digest('hex');
}

function contentParagraphs(product: SemanticProduct): string[] {
  const marked = (product.description ?? '')
    .replace(/<\/(?:p|li|h[1-6]|div|ul|ol)>/giu, '\n')
    .replace(/<(?:p|li|h[1-6]|div|ul|ol)\b[^>]*>/giu, '\n');
  const seen = new Set([
    cleanSemanticText(product.name).toLocaleLowerCase('vi'),
  ]);
  const paragraphs: Array<{ text: string; synopsis: boolean }> = [];
  let editorial = false;
  let synopsis = false;
  let stopped = false;
  for (const text of marked
    .split('\n')
    .map(cleanSemanticText)
    .filter(Boolean)) {
    if (
      /^(?:về|giới thiệu|thông tin)\s+(?:tác giả|dịch giả|họa sĩ)|^về tác giả cuốn sách/iu.test(
        text,
      )
    ) {
      editorial = true;
      continue;
    }
    if (/^(?:tóm tắt nội dung|nội dung sách|tóm tắt sách)/iu.test(text)) {
      editorial = false;
      synopsis = true;
      continue;
    }
    if (/^mục lục\s*:|^mục lục$/iu.test(text)) stopped = true;
    if (
      stopped ||
      editorial ||
      /^(?:mô tả sản phẩm|về dịch giả|giới thiệu tác giả|đặc điểm nổi bật|những nội dung đáng chú ý)\s*:?$/iu.test(
        text,
      ) ||
      /(?:top\s*\d+|best\s*seller|bestseller|new york times|giải thưởng|sách bán chạy|vé trong|doanh số|tổng số lượng sách bán|triệu bản|tỉ yên)/iu.test(
        text,
      ) ||
      text.length < 35 ||
      seen.has(text.toLocaleLowerCase('vi'))
    )
      continue;
    seen.add(text.toLocaleLowerCase('vi'));
    paragraphs.push({ text, synopsis });
  }
  return [
    ...paragraphs.filter((item) => item.synopsis),
    ...paragraphs.filter((item) => !item.synopsis),
  ].map((item) => item.text);
}

/** Uses the pinned tokenizer's actual token count, including special tokens. */
export function buildSemanticDocument(
  product: SemanticProduct,
  countTokens: (text: string) => number,
): string {
  const bodyTokens = (text: string): number => countTokens(text) - 2;
  const fit = (text: string, budget: number): string => {
    let low = 0;
    // Find a short upper bound first: long descriptions should not be fully
    // tokenized repeatedly just to retain a small leading field budget.
    let high = Math.min(text.length, Math.max(1, budget));
    while (bodyTokens(text.slice(0, high)) <= budget) {
      if (high === text.length) return text;
      low = high;
      high = Math.min(text.length, high * 2);
    }
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (bodyTokens(text.slice(0, middle)) <= budget) low = middle;
      else high = middle - 1;
    }
    const clipped = text.slice(0, low);
    return clipped.replace(/\s+\S*$/u, '').trim() || clipped;
  };
  const short = cleanSemanticText(product.shortDescription);
  const usableShort = /^(?:test|manual|kịch bản manual)\b/iu.test(short)
    ? ''
    : short;
  const fields = [
    fit(cleanSemanticText(product.name), 64),
    fit([...new Set(product.categories)].sort().join('; '), 48),
    fit(usableShort, 96),
    fit(
      contentParagraphs(product)
        .filter((text) => text !== usableShort)
        .join('\n'),
      232,
    ),
    fit(product.authors.slice().sort().join('; '), 32),
    fit(product.publisher ?? '', 24),
  ];
  const allocated = fit(fields.filter(Boolean).join('\n'), 508);
  const document = `passage: ${fit(allocated, 508 - bodyTokens('passage: '))}`;
  if (countTokens(document) > 512) throw new Error('AI_DOCUMENT_TOKEN_LIMIT');
  return document;
}
