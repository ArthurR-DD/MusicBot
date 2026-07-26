import { Readable } from 'node:stream';
import youtubedl, { create } from 'youtube-dl-exec';
import { config } from '../config';
import type { RemoteTrack } from './track';
import { isUrl } from './urls';

export { isUrl };

// Prefer a system-installed yt-dlp (set YT_DLP_PATH) so it can be updated
// independently of the npm package — important because sites change often.
const ytdl = config.ytDlpPath ? create(config.ytDlpPath) : youtubedl;

/** Optional escape hatches for sites that challenge automated access. */
const commonFlags: { cookies?: string; proxy?: string; extractorArgs?: string } = {
  ...(config.ytDlpCookies ? { cookies: config.ytDlpCookies } : {}),
  ...(config.ytDlpProxy ? { proxy: config.ytDlpProxy } : {}),
  ...(config.ytDlpExtractorArgs ? { extractorArgs: config.ytDlpExtractorArgs } : {}),
};


interface YtInfo {
  _type?: string;
  entries?: YtInfo[];
  title?: string;
  webpage_url?: string;
  original_url?: string;
  duration?: number;
}

/** Look up a link's metadata so the queue can show a real title. */
export async function resolveRemoteTrack(url: string, requestedBy: string): Promise<RemoteTrack> {
  const meta = (await ytdl(url, {
    dumpSingleJson: true,
    noWarnings: true,
    noPlaylist: true,
    ...commonFlags,
  })) as unknown as YtInfo;

  // A link to a playlist item can still report as a playlist; take the first.
  const info = meta._type === 'playlist' ? meta.entries?.[0] : meta;
  if (!info?.title) {
    throw new Error('No playable media found at that link.');
  }

  return {
    source: 'remote',
    title: info.title,
    url: info.webpage_url ?? info.original_url ?? url,
    duration: Math.floor(info.duration ?? 0),
    requestedBy,
  };
}

/**
 * Open a raw audio byte stream for a link. ffmpeg (via @discordjs/voice)
 * transcodes whatever comes out to Opus.
 */
export function createRemoteStream(url: string): Readable {
  const subprocess = ytdl.exec(
    url,
    {
      output: '-',
      format: config.ytDlpFormat,
      quiet: true,
      noWarnings: true,
      noPlaylist: true,
      ...commonFlags,
    },
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  if (!subprocess.stdout) {
    throw new Error('Failed to open the audio stream.');
  }

  // Surface yt-dlp's errors instead of silently yielding an empty stream.
  subprocess.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[yt-dlp] ${chunk.toString().trim()}`);
  });
  subprocess.catch(() => undefined);

  return subprocess.stdout;
}
