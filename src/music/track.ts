export interface Track {
  /** Display name (the file name without its extension). */
  title: string;
  /** Absolute path to the audio file on disk. */
  path: string;
  /** Display name of the user who requested the track. */
  requestedBy: string;
}
