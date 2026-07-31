import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Read JSON from disk, falling back to `fallback` when the file is missing,
 * unreadable, or malformed. A hand-edited or truncated file should degrade to
 * "no data" rather than take the bot down at startup.
 */
export async function readJson<T>(path: string, fallback: T, isValid: (v: unknown) => boolean): Promise<T> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return isValid(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write JSON via a temp file and rename, so a crash mid-write leaves the
 * previous contents intact instead of a truncated file.
 */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data), 'utf8');
  await rename(tmp, path);
}
