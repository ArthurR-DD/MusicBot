import { config } from './config';

/** Emoji used when no GIF URL is configured, so the feature works out of the box. */
export const PROUT_FALLBACK = '💨';

/**
 * What to post after a marked user's command: the configured GIF URL, or the
 * fallback emoji. Discord unfurls a bare Tenor/Giphy link into a playing GIF,
 * so the URL is sent as plain content rather than an embed.
 */
export function proutPayload(): string {
  return config.proutGifUrl ?? PROUT_FALLBACK;
}
