import 'dotenv/config';
import ffmpegPath from 'ffmpeg-static';

// Point @discordjs/voice / prism-media at the bundled ffmpeg binary so no
// system-wide ffmpeg install is required.
if (ffmpegPath && !process.env.FFMPEG_PATH) {
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
};
