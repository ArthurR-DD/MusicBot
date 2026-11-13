import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  memoizeAsync,
  normalizeQuery,
  parseSearchResults,
  parseSuggestQueries,
  withTimeout,
} from './suggestions';

describe('parseSearchResults', () => {
  test('maps flat-playlist entries to watch URLs', () => {
    const results = parseSearchResults({
      entries: [{ id: 'dQw4w9WgXcQ', title: 'Song', channel: 'Chan', duration: 212.4 }],
    });
    assert.deepEqual(results, [
      {
        title: 'Song',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        uploader: 'Chan',
        duration: 212,
      },
    ]);
  });

  test('falls back to uploader and a zero duration', () => {
    const [result] = parseSearchResults({
      entries: [{ id: 'dQw4w9WgXcQ', title: 'Live', uploader: 'Up', duration: null }],
    });
    assert.equal(result.uploader, 'Up');
    assert.equal(result.duration, 0);
  });

  test('skips malformed entries and non-video ids', () => {
    const results = parseSearchResults({
      entries: [
        null,
        { title: 'no id' },
        { id: 'dQw4w9WgXcQ' },
        { id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'a channel' },
        { id: 'abcdefghijk', title: 'ok' },
      ],
    });
    assert.deepEqual(
      results.map((r) => r.title),
      ['ok'],
    );
  });

  test('returns nothing for unexpected shapes', () => {
    assert.deepEqual(parseSearchResults(null), []);
    assert.deepEqual(parseSearchResults({}), []);
    assert.deepEqual(parseSearchResults({ entries: 'x' }), []);
  });
});

describe('parseSuggestQueries', () => {
  test('returns the suggestion strings', () => {
    assert.deepEqual(parseSuggestQueries(['daft pu', ['daft punk', 'daft punk get lucky'], [], {}]), [
      'daft punk',
      'daft punk get lucky',
    ]);
  });

  test('drops blanks and non-strings, and caps length', () => {
    const out = parseSuggestQueries(['q', ['ok', '  ', 5, null, 'x'.repeat(300)]]);
    assert.equal(out.length, 2);
    assert.equal(out[0], 'ok');
    assert.equal(out[1].length, 100);
  });

  test('returns nothing for unexpected shapes', () => {
    assert.deepEqual(parseSuggestQueries(null), []);
    assert.deepEqual(parseSuggestQueries({}), []);
    assert.deepEqual(parseSuggestQueries(['q', 'nope']), []);
  });
});

describe('normalizeQuery', () => {
  test('ignores case and spacing', () => {
    assert.equal(normalizeQuery('  Daft   Punk '), 'daft punk');
  });
});

describe('memoizeAsync', () => {
  test('shares in-flight calls and caches until the TTL expires', async () => {
    let calls = 0;
    let clock = 0;
    const fn = memoizeAsync(async (k) => `${k}${++calls}`, 1000, 10, () => clock);

    const [a, b] = await Promise.all([fn('q'), fn('q')]);
    assert.equal(a, 'q1');
    assert.equal(b, 'q1');
    assert.equal(await fn('q'), 'q1');

    clock = 1001;
    assert.equal(await fn('q'), 'q2');
  });

  test('does not cache failures', async () => {
    let calls = 0;
    const fn = memoizeAsync(async () => {
      if (++calls === 1) throw new Error('boom');
      return 'ok';
    }, 1000);

    await assert.rejects(fn('q'));
    assert.equal(await fn('q'), 'ok');
  });

  test('evicts the oldest entry past the cap', async () => {
    let calls = 0;
    const fn = memoizeAsync(async (k) => `${k}${++calls}`, 1000, 2);
    await fn('a');
    await fn('b');
    await fn('c'); // evicts a
    assert.equal(await fn('a'), 'a4');
  });
});

describe('withTimeout', () => {
  test('returns the value when fast enough', async () => {
    assert.equal(await withTimeout(Promise.resolve('v'), 50, 'fallback'), 'v');
  });

  test('returns the fallback when too slow or rejected', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 100));
    assert.equal(await withTimeout(slow, 10, 'fallback'), 'fallback');
    assert.equal(await withTimeout(Promise.reject(new Error('x')), 50, 'fallback'), 'fallback');
  });
});
