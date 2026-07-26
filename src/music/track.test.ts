import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { formatDuration } from './track';

describe('formatDuration', () => {
  test('formats minutes and seconds with a padded seconds field', () => {
    assert.equal(formatDuration(225), '3:45');
    assert.equal(formatDuration(65), '1:05');
    assert.equal(formatDuration(9), '0:09');
  });

  test('adds an hours field only past an hour, padding minutes', () => {
    assert.equal(formatDuration(3600), '1:00:00');
    assert.equal(formatDuration(3725), '1:02:05');
    assert.equal(formatDuration(3599), '59:59');
  });

  test('reports an unknown duration as live', () => {
    // yt-dlp reports 0 for live streams, and local files carry no duration.
    assert.equal(formatDuration(0), 'live');
    assert.equal(formatDuration(-1), 'live');
  });

  test('truncates fractional seconds', () => {
    assert.equal(formatDuration(90.9), '1:30');
  });
});
