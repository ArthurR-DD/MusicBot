import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type PlayRecord, rankHistory } from './history';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

function record(overrides: Partial<PlayRecord> & { url: string }): PlayRecord {
  return {
    guildId: 'g1',
    title: overrides.url,
    duration: 100,
    playedAt: NOW - DAY,
    ...overrides,
  };
}

describe('rankHistory', () => {
  test('orders by play count, most played first', () => {
    const ranked = rankHistory(
      [
        record({ url: 'a' }),
        record({ url: 'b' }),
        record({ url: 'b' }),
        record({ url: 'c' }),
        record({ url: 'c' }),
        record({ url: 'c' }),
      ],
      'g1',
      NOW,
      WEEK,
      10,
    );

    assert.deepEqual(
      ranked.map((r) => [r.track.url, r.plays]),
      [
        ['c', 3],
        ['b', 2],
        ['a', 1],
      ],
    );
  });

  test('ignores plays older than the window', () => {
    const ranked = rankHistory(
      [
        record({ url: 'old', playedAt: NOW - WEEK - DAY }),
        record({ url: 'old', playedAt: NOW - WEEK - 2 * DAY }),
        record({ url: 'recent', playedAt: NOW - 2 * DAY }),
      ],
      'g1',
      NOW,
      WEEK,
      10,
    );

    assert.deepEqual(
      ranked.map((r) => r.track.url),
      ['recent'],
    );
  });

  test('counts a play exactly on the window boundary', () => {
    const ranked = rankHistory([record({ url: 'edge', playedAt: NOW - WEEK })], 'g1', NOW, WEEK, 10);
    assert.equal(ranked.length, 1);
  });

  test('keeps guilds separate', () => {
    const ranked = rankHistory(
      [
        record({ url: 'mine' }),
        record({ url: 'theirs', guildId: 'g2' }),
        record({ url: 'theirs', guildId: 'g2' }),
      ],
      'g1',
      NOW,
      WEEK,
      10,
    );

    assert.deepEqual(
      ranked.map((r) => r.track.url),
      ['mine'],
    );
  });

  test('respects the limit', () => {
    const records = ['a', 'b', 'c', 'd'].map((url) => record({ url }));
    assert.equal(rankHistory(records, 'g1', NOW, WEEK, 2).length, 2);
  });

  test('uses the most recent metadata for a repeated link', () => {
    // Titles get renamed; the newest observation should win.
    const ranked = rankHistory(
      [
        record({ url: 'x', title: 'Old Title', playedAt: NOW - 3 * DAY }),
        record({ url: 'x', title: 'New Title', playedAt: NOW - DAY }),
      ],
      'g1',
      NOW,
      WEEK,
      10,
    );

    assert.equal(ranked[0]?.track.title, 'New Title');
    assert.equal(ranked[0]?.plays, 2);
  });

  test('produces playable remote tracks', () => {
    const ranked = rankHistory(
      [record({ url: 'https://example.com/v', title: 'Song', duration: 225 })],
      'g1',
      NOW,
      WEEK,
      10,
    );

    const track = ranked[0]?.track;
    assert.equal(track?.source, 'remote');
    assert.equal(track?.url, 'https://example.com/v');
    assert.equal(track?.duration, 225);
  });

  test('returns nothing when there is no history', () => {
    assert.deepEqual(rankHistory([], 'g1', NOW, WEEK, 10), []);
  });
});
