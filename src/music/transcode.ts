import { spawn } from 'node:child_process';
import { config } from '../config';

/**
 * Container formats we treat as video on upload: the video track is discarded
 * and only the audio is kept.
 *
 * `.webm` is here even though it can hold audio alone — extraction handles both
 * cases, so routing ambiguous containers through it is always safe.
 */
export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mkv',
  '.mov',
  '.avi',
  '.webm',
  '.flv',
  '.wmv',
  '.mpg',
  '.mpeg',
  '.ts',
  '.3gp',
]);

/** Extension written by {@link extractAudio}. */
export const EXTRACTED_EXTENSION = '.opus';

/**
 * Strip the audio out of `input` and write it to `output` as Opus.
 *
 * Opus is what Discord streams natively, so storing it avoids a second
 * conversion at playback time; re-encoding here rather than copying the source
 * stream keeps one predictable output format for any input container.
 */
export function extractAudio(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      config.ffmpegPath,
      [
        '-nostdin',
        '-loglevel',
        'error',
        '-y',
        '-i',
        input,
        '-vn', // drop video
        '-map_metadata',
        '-1', // drop metadata (may reference the video stream)
        '-c:a',
        'libopus',
        '-b:a',
        '160k',
        output,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    let stderr = '';
    ffmpeg.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
      reject(new Error('Audio extraction timed out.'));
    }, config.extractTimeoutMs);

    ffmpeg.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not run ffmpeg: ${error.message}`));
    });

    ffmpeg.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300);
      reject(new Error(`ffmpeg exited with code ${code}${detail ? `: ${detail}` : ''}`));
    });
  });
}
