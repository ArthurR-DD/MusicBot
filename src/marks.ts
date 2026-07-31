import { config } from './config';
import { readJson, writeJsonAtomic } from './store';

/** Marked user IDs, keyed by guild. */
export type MarkStore = Record<string, string[]>;

let cache: MarkStore | undefined;
/** Serialises writes so two marks in quick succession can't clobber each other. */
let writeQueue: Promise<unknown> = Promise.resolve();

function isMarkStore(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function load(): Promise<MarkStore> {
  cache ??= await readJson<MarkStore>(config.marksFile, {}, isMarkStore);
  return cache;
}

/**
 * Add or remove a user from a guild's marks, returning a new store and whether
 * the user ends up marked. Pure, so the toggle can be exercised directly.
 */
export function applyToggle(
  store: MarkStore,
  guildId: string,
  userId: string,
): { store: MarkStore; marked: boolean } {
  const current = store[guildId] ?? [];
  const marked = !current.includes(userId);
  const next = marked ? [...current, userId] : current.filter((id) => id !== userId);

  const updated: MarkStore = { ...store };
  if (next.length > 0) {
    updated[guildId] = next;
  } else {
    // Drop empty guilds so the file doesn't accumulate dead keys.
    delete updated[guildId];
  }

  return { store: updated, marked };
}

/** Toggle a user's mark. Resolves to true when they are now marked. */
export async function toggleMark(guildId: string, userId: string): Promise<boolean> {
  const { store, marked } = applyToggle(await load(), guildId, userId);
  cache = store;

  writeQueue = writeQueue
    .then(() => writeJsonAtomic(config.marksFile, store))
    .catch((error) => console.error('Could not save marks:', error));
  await writeQueue;

  return marked;
}

export async function isMarked(guildId: string, userId: string): Promise<boolean> {
  return ((await load())[guildId] ?? []).includes(userId);
}

export async function listMarked(guildId: string): Promise<string[]> {
  return [...((await load())[guildId] ?? [])];
}

/** Drop the in-memory cache; used by tests. */
export function resetMarksCache(): void {
  cache = undefined;
}
