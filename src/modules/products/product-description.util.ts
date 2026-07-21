import sanitizeHtml from 'sanitize-html';

const EMPTY_RICH_TEXT = /^(?:\s|<p>(?:\s|<br\s*\/?\s*>)*<\/p>)*$/i;

export function sanitizeProductDescription(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || EMPTY_RICH_TEXT.test(value)) return null;

  const sanitized = sanitizeHtml(value, {
    allowedTags: [
      'p',
      'br',
      'h2',
      'h3',
      'h4',
      'strong',
      'em',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
    ],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          href: attribs.href ?? '',
          ...(attribs.target === '_blank'
            ? { target: '_blank', rel: 'noopener noreferrer' }
            : {}),
        },
      }),
    },
  }).trim();

  return sanitized.length === 0 || EMPTY_RICH_TEXT.test(sanitized)
    ? null
    : sanitized;
}
