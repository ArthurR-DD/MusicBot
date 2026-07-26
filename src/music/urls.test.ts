import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isUrl } from './urls';

describe('isUrl', () => {
  test('treats http(s) links as links', () => {
    for (const query of [
      'https://www.youtube.com/watch?v=abc123',
      'http://youtu.be/abc',
      'https://soundcloud.com/artist/track',
      'HTTPS://YouTube.com/watch?v=X', // scheme is case-insensitive
      '  https://youtu.be/abc  ', // padding from a copy/paste
    ]) {
      assert.ok(isUrl(query), `expected ${JSON.stringify(query)} to be treated as a link`);
    }
  });

  test('treats everything else as a library search', () => {
    for (const query of [
      'homer let the barts out',
      'thunder road',
      'http', // bare scheme word
      'https://', // scheme with no host
      'not a url http://x.com', // a link mid-sentence is still a search
      'ftp://example.com/a.mp3', // unsupported scheme
    ]) {
      assert.ok(!isUrl(query), `expected ${JSON.stringify(query)} to be treated as a search`);
    }
  });

  test('treats a library file path as a search, not a link', () => {
    // Autocomplete sends the absolute file path as the option value, so this
    // must not be mistaken for a remote source.
    assert.ok(!isUrl('/app/music/Some Song.mp3'));
  });
});
