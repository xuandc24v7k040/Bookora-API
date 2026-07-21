import { sanitizeProductDescription } from './product-description.util';

describe('sanitizeProductDescription', () => {
  it('keeps the supported Tiptap structure and safe links', () => {
    expect(
      sanitizeProductDescription(
        '<h2>Tiêu đề</h2><p><strong>Nội dung</strong></p><a href="https://bookora.vn" target="_blank">Link</a>',
      ),
    ).toContain('rel="noopener noreferrer"');
  });

  it('removes scripts, event handlers and javascript URLs', () => {
    const result = sanitizeProductDescription(
      '<p onclick="alert(1)">An toàn</p><script>alert(1)</script><a href="javascript:alert(1)">Xấu</a>',
    );
    expect(result).toBe('<p>An toàn</p><a>Xấu</a>');
  });

  it.each([null, '', '<p></p>', '<p><br></p>'])(
    'normalizes empty rich text %p to null',
    (value) => {
      expect(sanitizeProductDescription(value)).toBeNull();
    },
  );
});
