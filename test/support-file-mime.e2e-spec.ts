import { validateSupportFile } from '@/modules/support/support-file-validation';
import { supportFileFixtures } from './helpers/support-files';

describe('Support upload platform MIME compatibility', () => {
  const file = (
    buffer: Buffer,
    mimetype: string,
    originalname = 'support.zip',
  ) => ({ buffer, mimetype, originalname }) as Express.Multer.File;

  it('accepts the Windows ZIP alias and returns the canonical MIME', async () => {
    const zip = (await supportFileFixtures()).fixtures.find(
      (entry) => entry.filename === 'support.zip',
    )!;
    await expect(
      validateSupportFile(file(zip.bytes, 'application/x-zip-compressed')),
    ).resolves.toEqual({
      filename: 'support.zip',
      mimeType: 'application/zip',
      size: zip.bytes.length,
    });
  });

  it('still rejects invalid archive bytes with the Windows alias', async () => {
    await expect(
      validateSupportFile(
        file(Buffer.from('invalid'), 'application/x-zip-compressed'),
      ),
    ).rejects.toThrow();
  });

  it('does not accept the ZIP alias for another extension', async () => {
    const png = (await supportFileFixtures()).png;
    await expect(
      validateSupportFile(
        file(png, 'application/x-zip-compressed', 'support.png'),
      ),
    ).rejects.toThrow();
  });
});
