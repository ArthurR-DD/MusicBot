import { existsSync } from 'node:fs';
import 'dotenv/config';
import ffmpegPath from 'ffmpeg-static';

// Point @discordjs/voice / prism-media at the bundled ffmpeg binary so no
// system-wide ffmpeg install is required. ffmpeg-static reports a path even
// when its download was skipped or failed, so only use it if the file is
// really there — otherwise fall through to ffmpeg on PATH.
if (ffmpegPath && existsSync(ffmpegPath) && !process.env.FFMPEG_PATH) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: process.env.GUILD_ID?.trim() || undefined,
  /** Folder scanned for playable audio files. */
  musicDir: process.env.MUSIC_DIR?.trim() || '/app/music',
  /** How long the scanned file list is cached before rescanning. */
  libraryTtlMs: Number(process.env.LIBRARY_TTL_MS ?? 60_000),
  /** Largest file /upload will accept, in megabytes. */
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 100),
  /** ffmpeg binary, used to strip audio out of uploaded video files. */
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  /** How long an audio extraction may run before it's killed, in ms. */
  extractTimeoutMs: Number(process.env.EXTRACT_TIMEOUT_MS ?? 600_000),

  // --- Link playback (yt-dlp) ---
  /** System yt-dlp binary. Falls back to the one bundled with youtube-dl-exec. */
  ytDlpPath: process.env.YT_DLP_PATH?.trim() || undefined,
  /** yt-dlp format selector for streamed links. */
  ytDlpFormat: process.env.YT_DLP_FORMAT?.trim() || 'bestaudio/best',
  /** Netscape cookies.txt, if a site demands a signed-in session. */
  ytDlpCookies: process.env.YT_DLP_COOKIES?.trim() || undefined,
  /** Proxy URL for yt-dlp. */
  ytDlpProxy: process.env.YT_DLP_PROXY?.trim() || undefined,
  /** Extra yt-dlp extractor args, e.g. youtube:player_client=tv */
  ytDlpExtractorArgs: process.env.YT_DLP_EXTRACTOR_ARGS?.trim() || undefined,
};
