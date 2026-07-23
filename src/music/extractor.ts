import { Readable } from 'node:stream';
import youtubedl from 'youtube-dl-exec';
import type { Track } from './track';

const URL_RE = /^https?:\/\//i;

interface YtInfo {
  _type?: string;
  entries?: YtInfo[];
  title?: string;
  webpage_url?: string;
  original_url?: string;
  duration?: number;
}

/**
 * Resolve a raw user query (a URL, or free-text to search YouTube for) into a
 * single playable Track using yt-dlp metadata.
 */
export async function resolveTrack(query: string, requestedBy: string): Promise<Track> {
  const target = URL_RE.test(query) ? query : `ytsearch1:${query}`;

  const meta = (await youtubedl(target, {
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
    preferFreeFormats: true,
  })) as unknown as YtInfo;

  const info = meta._type === 'playlist' ? meta.entries?.[0] : meta;
  if (!info || !info.title) {
    throw new Error('No results found for that query.');
  }

  return {
    title: info.title,
    url: info.webpage_url ?? info.original_url ?? query,
    duration: Math.floor(info.duration ?? 0),
    requestedBy,
  };
}

/**
 * Open a raw audio byte stream for a resolved track URL. The stream is fed to
 * ffmpeg (via @discordjs/voice) for transcoding to Opus.
 */
export function createAudioStream(url: string): Readable {
  const subprocess = youtubedl.exec(
    url,
    {
      output: '-',
      format: 'bestaudio[ext=webm]/bestaudio/best',
      quiet: true,
      noWarnings: true,
      noPlaylist: true,
    },
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );

  if (!subprocess.stdout) {
    throw new Error('Failed to open the audio stream.');
  }

  // Surface spawn failures instead of crashing the process.
  subprocess.catch(() => undefined);

  return subprocess.stdout;
}
