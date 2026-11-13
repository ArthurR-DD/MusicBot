import { formatDuration } from './track';

/** One YouTube search hit, reduced to what autocomplete needs. */
export interface SearchResult {
  title: string;
  url: string;
  uploader?: string;
  /** Seconds, or 0 when unknown (live streams). */
  duration: number;
}

/** A Discord autocomplete choice. Both fields are capped at 100 characters. */
export interface Suggestion {
  name: string;
  value: string;
}

const MAX_CHOICE_LENGTH = 100;

interface FlatEntry {
  id?: unknown;
  title?: unknown;
  duration?: unknown;
  channel?: unknown;
  uploader?: unknown;
}

/** Truncate with an ellipsis so cut-off titles are visibly cut off. */
function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Turn yt-dlp's `--flat-playlist` JSON for a `ytsearchN:` query into results.
 * Entries without an id or title are dropped rather than failing the batch.
 */
export function parseSearchResults(raw: unknown): SearchResult[] {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return [];

  const results: SearchResult[] = [];
  for (const entry of entries as FlatEntry[]) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.title !== 'string') continue;
    // Video ids are 11 URL-safe characters; anything else (a channel or
    // playlist id) would build a link /play can't resolve as a single video.
    if (!/^[\w-]{11}$/.test(entry.id)) continue;

    const uploader =
      typeof entry.channel === 'string'
        ? entry.channel
        : typeof entry.uploader === 'string'
          ? entry.uploader
          : undefined;

    results.push({
      title: entry.title,
      url: `https://www.youtube.com/watch?v=${entry.id}`,
      uploader,
      duration: typeof entry.duration === 'number' ? Math.floor(entry.duration) : 0,
    });
  }
  return results;
}

/** `🎬 Title — Channel (3:45)`, with the title trimmed first if too long. */
export function formatSuggestion(result: SearchResult): Suggestion {
  const suffix =
    (result.uploader ? ` — ${clip(result.uploader, 25)}` : '') +
    ` (${formatDuration(result.duration)})`;
  const prefix = '🎬 ';
  const room = MAX_CHOICE_LENGTH - prefix.length - suffix.length;

  return {
    name: `${prefix}${clip(result.title, Math.max(room, 10))}${suffix}`.slice(0, MAX_CHOICE_LENGTH),
    value: result.url,
  };
}

/** Lowercase and collapse whitespace so "Daft  Punk" and "daft punk" share a cache entry. */
export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Cache an async lookup by key for `ttlMs`. Concurrent calls for the same key
 * share one in-flight promise, and failures are not cached.
 */
export function memoizeAsync<T>(
  fn: (key: string) => Promise<T>,
  ttlMs: number,
  maxEntries = 200,
  now: () => number = Date.now,
): (key: string) => Promise<T> {
  const cache = new Map<string, { expires: number; value: Promise<T> }>();

  return (key) => {
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.value;

    const value = fn(key);
    cache.set(key, { expires: now() + ttlMs, value });
    value.catch(() => {
      if (cache.get(key)?.value === value) cache.delete(key);
    });

    // Drop the oldest entries (Map keeps insertion order) so it can't grow forever.
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value as string;
      cache.delete(oldest);
    }
    return value;
  };
}

/** Resolve to `fallback` if `promise` is slower than `ms` or rejects. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
