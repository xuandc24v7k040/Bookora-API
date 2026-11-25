import { extname } from 'node:path';
import sharp from 'sharp';
import { SUPPORT_MAX_FILE_SIZE, supportInvalid } from './support.policy';

const types: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.zip': 'application/zip',
};

/** Read central-directory filenames only, never decompress or execute archive entries. */
function zipEntries(bytes: Buffer): string[] | null {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (
    end < 0 ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    return null;
  const count = bytes.readUInt16LE(end + 10),
    size = bytes.readUInt32LE(end + 12),
    offset = bytes.readUInt32LE(end + 16);
  if (
    !count ||
    count > 10000 ||
    offset + size !== end ||
    bytes.readUInt16LE(end + 8) !== count
  )
    return null;
  const names: string[] = [];
  let cursor = offset;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      return null;
    const length = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32);
    const next = cursor + 46 + length + extra + comment;
    if (next > end) return null;
    const local = bytes.readUInt32LE(cursor + 42);
    if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50)
      return null;
    const name = bytes
      .subarray(cursor + 46, cursor + 46 + length)
      .toString('utf8');
    if (
      name.includes('..') ||
      name.startsWith('/') ||
      name.includes('\\') ||
      Array.from(name).some((char) => char.charCodeAt(0) < 32)
    )
      return null;
    names.push(name);
    cursor = next;
  }
  return cursor === end ? names : null;
}

export async function validateSupportFile(file: Express.Multer.File) {
  if (file.buffer.length > SUPPORT_MAX_FILE_SIZE)
    supportInvalid('SUPPORT_ATTACHMENT_TOO_LARGE', 'Mỗi tệp tối đa 10 MiB.');
  const filename = file.originalname
    .normalize('NFC')
    .replace(/[/\\"<>:|?*]/g, '_')
    .split('')
    .map((char) =>
      char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? '_' : char,
    )
    .join('')
    .slice(0, 180);
  const extension = extname(filename).toLowerCase();
  const mimeType = types[extension];
  const bytes = file.buffer;
  // Windows browsers identify .zip files with this registered platform alias.
  // Store/serve the canonical MIME; the archive validation below remains mandatory.
  const suppliedMime =
    extension === '.zip' && file.mimetype === 'application/x-zip-compressed'
      ? 'application/zip'
      : file.mimetype;
  let valid = !!mimeType && suppliedMime === mimeType && bytes.length > 0;
  if (valid && mimeType.startsWith('image/')) {
    try {
      const meta = await sharp(bytes, {
        limitInputPixels: 40_000_000,
        animated: false,
      }).metadata();
      valid =
        meta.format ===
        { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[
          mimeType
        ];
    } catch {
      valid = false;
    }
  } else if (valid && extension === '.pdf')
    valid =
      bytes.subarray(0, 5).toString() === '%PDF-' &&
      bytes
        .subarray(Math.max(0, bytes.length - 1024))
        .includes(Buffer.from('%%EOF'));
  else if (valid && extension === '.mp4')
    valid =
      bytes.length >= 16 &&
      bytes.subarray(4, 8).toString() === 'ftyp' &&
      bytes.readUInt32BE(0) >= 16 &&
      bytes.readUInt32BE(0) <= bytes.length &&
      /^(isom|iso[2-6]|mp4[12]|avc1|M4V )$/.test(
        bytes.subarray(8, 12).toString(),
      );
  else if (valid && extension === '.webm')
    valid =
      bytes.length > 16 &&
      bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
      bytes.subarray(4, 4096).includes(Buffer.from('webm'));
  else if (valid && (extension === '.zip' || extension === '.docx')) {
    const entries = zipEntries(bytes);
    valid = entries !== null;
    if (extension === '.docx')
      valid =
        !!entries?.includes('[Content_Types].xml') &&
        entries.includes('word/document.xml') &&
        !entries.some((name) => /vbaProject|\.exe$|\.js$/i.test(name));
  }
  if (!valid)
    supportInvalid(
      'SUPPORT_ATTACHMENT_INVALID',
      'Loại tệp hoặc nội dung tệp không hợp lệ.',
    );
  return { filename, mimeType, size: bytes.length };
}
