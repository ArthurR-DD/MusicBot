import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config';
import type { RemoteTrack } from './track';

/** One play of a link, as persisted. */
export interface PlayRecord {
  guildId: string;
  url: string;
  title: string;
  duration: number;
  thumbnail?: string;
  uploader?: string;
  /** Epoch milliseconds. */
  playedAt: number;
}

/** A link and how often it was played inside the window. */
export interface RankedTrack {
  track: RemoteTrack;
  plays: number;
}

let cache: PlayRecord[] | undefined;
/** Serialises writes so concurrent plays can't clobber each other's records. */
let writeQueue: Promise<unknown> = Promise.resolve();

function windowMs(): number {
  return config.historyWindowDays * 24 * 60 * 60 * 1000;
}

async function load(): Promise<PlayRecord[]> {
  if (cache) return cache;
  try {
    const raw = await readFile(config.historyFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    // Tolerate a corrupt or hand-edited file rather than crashing the bot.
    cache = Array.isArray(parsed) ? (parsed as PlayRecord[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function persist(records: PlayRecord[]): Promise<void> {
  await mkdir(dirname(config.historyFile), { recursive: true });
  // Write to a temp file and rename, so a crash mid-write can't truncate the
  // existing history.
  const tmp = `${config.historyFile}.tmp`;
  await writeFile(tmp, JSON.stringify(records), 'utf8');
  await rename(tmp, config.historyFile);
}

/**
 * Note that a link was played in a guild. Only explicit `/play` requests should
 * call this — queueing from `/radio` must not count, or popular tracks would
 * inflate their own ranking every time the radio replayed them.
 */
export async function recordPlay(guildId: string, track: RemoteTrack): Promise<void> {
  const records = await load();
  records.push({
    guildId,
    url: track.url,
    title: track.title,
    duration: track.duration,
    thumbnail: track.thumbnail,
    uploader: track.uploader,
    playedAt: Date.now(),
  });

  // Drop anything outside the window so the file stays bounded.
  const cutoff = Date.now() - windowMs();
  cache = records.filter((r) => r.playedAt >= cutoff);

  const snapshot = [...cache];
  writeQueue = writeQueue
    .then(() => persist(snapshot))
    .catch((error) => console.error('Could not save play history:', error));
  await writeQueue;
}

/**
 * Rank a guild's plays within the window, most played first. Pure, so it can be
 * exercised without touching the filesystem or the clock.
 */
export function rankHistory(
  records: readonly PlayRecord[],
  guildId: string,
  now: number,
  window: number,
  limit: number,
): RankedTrack[] {
  const cutoff = now - window;
  const byUrl = new Map<string, { record: PlayRecord; plays: number }>();

  for (const record of records) {
    if (record.guildId !== guildId || record.playedAt < cutoff) continue;
    const existing = byUrl.get(record.url);
    if (existing) {
      existing.plays += 1;
      // Keep the newest metadata; titles and thumbnails can change.
      if (record.playedAt >= existing.record.playedAt) existing.record = record;
    } else {
      byUrl.set(record.url, { record, plays: 1 });
    }
  }

  return [...byUrl.values()]
    .sort((a, b) => b.plays - a.plays || b.record.playedAt - a.record.playedAt)
    .slice(0, limit)
    .map(({ record, plays }) => ({
      plays,
      track: {
        source: 'remote',
        title: record.title,
        url: record.url,
        duration: record.duration,
        thumbnail: record.thumbnail,
        uploader: record.uploader,
        requestedBy: 'radio',
      },
    }));
}

/** The guild's most played links over the configured window, most played first. */
export async function topTracks(guildId: string, limit: number): Promise<RankedTrack[]> {
  return rankHistory(await load(), guildId, Date.now(), windowMs(), limit);
}

/** Drop the in-memory cache; used by tests. */
export function resetHistoryCache(): void {
  cache = undefined;
}
