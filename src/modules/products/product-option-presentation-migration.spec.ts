import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('product option presentation migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260721120000_add_product_option_presentation_type/migration.sql',
    ),
    'utf8',
  );

  it('backfills COLOR before IMAGE and preserves TEXT fallback', () => {
    const color = sql.indexOf("THEN 'COLOR'");
    const image = sql.indexOf("THEN 'IMAGE'");
    const text = sql.indexOf("ELSE 'TEXT'");
    expect(color).toBeGreaterThan(-1);
    expect(image).toBeGreaterThan(color);
    expect(text).toBeGreaterThan(image);
  });

  it('is additive and does not clear legacy color or image data', () => {
    expect(sql).toContain('ADD COLUMN "presentation_type"');
    expect(sql).not.toMatch(/DROP\s+(?:COLUMN|TABLE|TYPE)/i);
    expect(sql).not.toMatch(/SET\s+"(?:color_code|image_url)"\s*=\s*NULL/i);
  });
});
