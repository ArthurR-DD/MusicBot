export interface Track {
  title: string;
  url: string;
  /** Duration in seconds (0 if unknown, e.g. live streams). */
  duration: number;
  /** Display name of the user who requested the track. */
  requestedBy: string;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'live';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
