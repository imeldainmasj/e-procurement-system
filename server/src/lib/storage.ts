import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { dayjs } from './dayjs.js';
import { logger } from './logger.js';

const root = path.resolve(env.UPLOAD_DIR);

/** Resolves a stored relative path, refusing anything that escapes UPLOAD_DIR. */
function absolute(relativePath: string): string {
  const full = path.resolve(root, relativePath);
  if (full !== root && !full.startsWith(root + path.sep))
    throw new Error(`Invalid storage path: ${relativePath}`);
  return full;
}

/** Writes the file under YYYY/MM/<uuid><ext> and returns its relative path. */
export async function saveFile(buffer: Buffer, originalName: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  const relativePath = path.posix.join(dayjs().tz().format('YYYY/MM'), `${randomUUID()}${ext}`);
  const full = absolute(relativePath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buffer, { flag: 'wx' });
  return relativePath;
}

export function openFile(relativePath: string): ReadStream {
  return createReadStream(absolute(relativePath));
}

/** Best-effort delete; a missing file is not an error. */
export async function removeFile(relativePath: string): Promise<void> {
  try {
    await rm(absolute(relativePath), { force: true });
  } catch (err) {
    logger.warn({ err, relativePath }, 'Gagal menghapus file');
  }
}
