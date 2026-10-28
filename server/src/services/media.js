import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { HttpError } from './validation.js';

export const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || fileURLToPath(new URL('../../uploads/', import.meta.url)));
export const maxImageBytes = 5 * 1024 * 1024;
const localImage = /^\/uploads\/([a-f0-9-]{36}\.webp)$/;

// This boundary can be replaced by object storage without changing API consumers.
export async function saveImage(buffer, kind) {
  if (!buffer?.length || buffer.length > maxImageBytes) throw new HttpError(413, 'Images must be at most 5 MB.');
  let encoded;
  try {
    const decoder = sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'warning' });
    const metadata = await decoder.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error();
    encoded = await decoder.rotate().resize({
      width: kind === 'avatar' ? 800 : 2400, height: kind === 'avatar' ? 800 : 1200,
      fit: 'inside', withoutEnlargement: true,
    }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw new HttpError(400, 'Choose a valid, non-animated JPEG, PNG, or WebP image (up to 40 megapixels).');
  }
  await mkdir(uploadDirectory, { recursive: true });
  const name = randomUUID() + '.webp';
  await writeFile(path.join(uploadDirectory, name), encoded, { flag: 'wx' });
  return '/uploads/' + name;
}

export async function removeImage(url) {
  const match = typeof url === 'string' && localImage.exec(url);
  if (!match) return;
  try { await unlink(path.join(uploadDirectory, match[1])); }
  catch (error) {
    // A cleanup failure must not undo or misreport a committed profile save.
    if (error.code !== 'ENOENT') console.error('Image cleanup failed:', error.code || 'unknown');
  }
}
