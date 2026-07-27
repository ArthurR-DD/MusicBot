import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { config } from '../config';
import type { Track } from './track';

/** File extensions ffmpeg can decode that we treat as playable audio. */
export const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.aac',
  '.opus',
  '.ogg',
  '.oga',
  '.flac',
  '.wav',
  '.wma',
  '.webm',
]);

export interface LibraryEntry {
  /** Display name: the file name without its extension. */
  title: string;
  /** Absolute path on disk. */
  path: string;
  /** Lowercased title, used for matching. */
  search: string;
}

let cache: LibraryEntry[] = [];
let loadedAt = 0;

/**
 * Recursively collect audio files under `dir`. Exported (and parameterised)
 * so it can be exercised against a fixture directory.
 */
export async function scanDirectory(dir: string, depth = 0): Promise<LibraryEntry[]> {
  if (depth > 8) return [];

  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }

  const found: LibraryEntry[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);

    let info;
    try {
      info = await stat(full);
    } catch {
      continue;
    }

    if (info.isDirectory()) {
      found.push(...(await scanDirectory(full, depth + 1)));
    } else if (AUDIO_EXTENSIONS.has(extname(name).toLowerCase())) {
      const title = basename(name, extname(name));
      found.push({ title, path: full, search: normalize(title) });
    }
  }
  return found;
}

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * All audio files in the library directory. Cached, and refreshed when the
 * cache is older than the configured TTL so newly added files are picked up
 * without restarting the bot.
 */
export async function getLibrary(force = false): Promise<LibraryEntry[]> {
  const age = Date.now() - loadedAt;
  if (force || loadedAt === 0 || age > config.libraryTtlMs) {
    cache = await scanDirectory(config.musicDir);
    loadedAt = Date.now();
    console.log(`Library: ${cache.length} track(s) in ${config.musicDir}`);
  }
  return cache;
}

/** Force the next getLibrary() call to rescan (e.g. after adding a file). */
export function invalidateLibrary(): void {
  loadedAt = 0;
}

/**
 * Rank library entries against a query. Higher score is a better match;
 * entries that don't match at all are excluded.
 */
export function score(entry: LibraryEntry, query: string): number {
  const q = normalize(query);
  if (!q) return 1;
  if (entry.search === q) return 100;
  if (entry.search.startsWith(q)) return 80;
  if (entry.search.includes(q)) return 60;

  // Fall back to matching every word of the query somewhere in the title.
  const words = q.split(' ');
  if (words.length > 1 && words.every((w) => entry.search.includes(w))) return 40;
  return 0;
}

/** Rank a set of entries against a query, best first, dropping non-matches. */
export function rankEntries(
  entries: readonly LibraryEntry[],
  query: string,
  limit = 25,
): LibraryEntry[] {
  return entries
    .map((entry) => ({ entry, s: score(entry, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map((r) => r.entry);
}

/** Best matches for a query from the cached library, best first. */
export async function searchLibrary(query: string, limit = 25): Promise<LibraryEntry[]> {
  return rankEntries(await getLibrary(), query, limit);
}

/** Find one track for a query, or undefined if nothing matches. */
export async function findTrack(query: string, requestedBy: string): Promise<Track | undefined> {
  // An exact path from autocomplete resolves directly.
  const entries = await getLibrary();
  const exact = entries.find((entry) => entry.path === query);
  const match = exact ?? (await searchLibrary(query, 1))[0];
  if (!match) return undefined;

  return { source: 'file', title: match.title, path: match.path, requestedBy };
}
