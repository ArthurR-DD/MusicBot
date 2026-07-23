import { Readable } from 'node:stream';
import youtubedl, { create } from 'youtube-dl-exec';
import type { Track } from './track';

// In production (e.g. Docker) point YT_DLP_PATH at a system-installed yt-dlp
// binary so it can be updated independently of the npm package. Otherwise fall
// back to the binary bundled by youtube-dl-exec.
const ytdl = process.env.YT_DLP_PATH ? create(process.env.YT_DLP_PATH) : youtubedl;

// On datacenter/cloud IPs YouTube often demands sign-in ("confirm you're not a
// bot"). Point YT_DLP_COOKIES at a Netscape-format cookies.txt exported from a
// logged-in (throwaway) account to authenticate yt-dlp.
const cookieFlags: { cookies?: string } = process.env.YT_DLP_COOKIES
  ? { cookies: process.env.YT_DLP_COOKIES }
  : {};

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

  const meta = (await ytdl(target, {
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
    preferFreeFormats: true,
    ...cookieFlags,
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
  const subprocess = ytdl.exec(
    url,
    {
      output: '-',
      format: 'bestaudio[ext=webm]/bestaudio/best',
      quiet: true,
      noWarnings: true,
      noPlaylist: true,
      ...cookieFlags,
    },
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  if (!subprocess.stdout) {
    throw new Error('Failed to open the audio stream.');
  }

  // Surface yt-dlp errors (e.g. YouTube blocking the host) instead of silently
  // producing an empty stream.
  subprocess.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[yt-dlp] ${chunk.toString().trim()}`);
  });
  subprocess.catch(() => undefined);

  return subprocess.stdout;
}
