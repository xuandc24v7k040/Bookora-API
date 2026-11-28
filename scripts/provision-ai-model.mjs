import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  await fs.readFile(join(root, 'src/modules/ai/model-files.json'), 'utf8'),
);
const args = process.argv.slice(2);
const value = (key) => {
  const index = args.indexOf(key);
  if (index < 0) return undefined;
  if (!args[index + 1]) throw new Error(`Missing ${key} argument`);
  return args[index + 1];
};
const destination = resolve(
  value('--destination') ?? join(root, '.local-models/e5-small'),
);
const source = value('--from');
async function valid(file, entry) {
  try {
    if ((await fs.stat(file)).size !== entry.bytes) return false;
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex') === entry.sha256;
  } catch {
    return false;
  }
}
for (const entry of manifest.files) {
  const file = join(destination, entry.file);
  if (await valid(file, entry)) {
    console.log(`Verified existing ${entry.file}`);
    continue;
  }
  await fs.mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.download`;
  if (source) {
    await fs.copyFile(join(resolve(source), entry.file), temporary);
  } else {
    const response = await fetch(
      `https://huggingface.co/${manifest.model}/resolve/${manifest.revision}/${entry.file}`,
    );
    if (!response.ok)
      throw new Error(
        `Model provision failed: ${entry.file} HTTP ${response.status}`,
      );
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(temporary),
    );
  }
  if (!(await valid(temporary, entry)))
    throw new Error(`Model checksum mismatch: ${entry.file}`);
  await fs.rename(temporary, file);
  console.log(`Provisioned ${entry.file}`);
}
console.log(`Local ${manifest.model}@${manifest.revision}: ${destination}`);
