const URL_RE = /^https?:\/\/\S+$/i;

/** True when a /play query should be handled as a link rather than a search. */
export function isUrl(query: string): boolean {
  return URL_RE.test(query.trim());
}
