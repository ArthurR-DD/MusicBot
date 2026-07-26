interface TrackBase {
  /** Display name shown in Discord. */
  title: string;
  /** Display name of the user who requested the track. */
  requestedBy: string;
}

/** A file from the local music library. */
export interface FileTrack extends TrackBase {
  source: 'file';
  /** Absolute path to the audio file on disk. */
  path: string;
}

/** A remote track streamed through yt-dlp. */
export interface RemoteTrack extends TrackBase {
  source: 'remote';
  /** Page URL the audio is streamed from. */
  url: string;
  /** Duration in seconds, or 0 when unknown (e.g. live streams). */
  duration: number;
  /** Cover/preview image URL, when the site provides one. */
  thumbnail?: string;
  /** Channel or uploader name, when known. */
  uploader?: string;
}

export type Track = FileTrack | RemoteTrack;

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'live';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
