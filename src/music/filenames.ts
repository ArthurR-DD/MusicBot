import { access } from 'node:fs/promises';
import { basename, join } from 'node:path';

/** Characters that are unsafe or awkward in a file name. */
const UNSAFE_CHARS = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/**
 * Reduce an arbitrary user-supplied name to a safe bare file name. Strips any
 * directory components, control characters and path-significant characters, so
 * a supplied name can never be written outside the library directory.
 *
 * Returns an empty string when nothing usable remains — callers must reject it.
 */
export function safeName(raw: string): string {
  // basename() drops any directory part, including "../" traversal attempts.
  const bare = basename(raw);

  const filtered = [...bare]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 32 || code === 127) return false; // control characters
      return !UNSAFE_CHARS.has(ch);
    })
    .join('');

  return filtered
    .replace(/\s+/g, ' ')
    .trim()
    // Reject leading dots so a name can't create hidden files or "..".
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
}

/** Find a free path, appending " (2)", " (3)", … if the name is taken. */
export async function uniquePath(dir: string, stem: string, ext: string): Promise<string> {
  for (let i = 1; i < 100; i += 1) {
    const candidate = join(dir, i === 1 ? `${stem}${ext}` : `${stem} (${i})${ext}`);
    try {
      await access(candidate);
    } catch {
      return candidate; // does not exist — free to use
    }
  }
  throw new Error('Too many files with that name.');
}
