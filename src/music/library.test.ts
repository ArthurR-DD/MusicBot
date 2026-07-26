import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { type LibraryEntry, normalize, rankEntries, scanDirectory } from './library';

/** Build entries the way scanDirectory does, for ranking tests. */
function entry(title: string): LibraryEntry {
  return { title, path: `/music/${title}.mp3`, search: normalize(title) };
}

describe('scanDirectory', () => {
  let dir: string;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'library-test-'));
    await mkdir(join(dir, 'Rock'));
    await mkdir(join(dir, 'Chill', 'Deep'), { recursive: true });

    await Promise.all([
      writeFile(join(dir, 'Homer_Let_The_Barts_Out.mp3'), ''),
      writeFile(join(dir, 'Some Song (Live).m4a'), ''),
      writeFile(join(dir, 'Rock', 'Thunder Road.flac'), ''),
      writeFile(join(dir, 'Chill', 'evening-calm.opus'), ''),
      writeFile(join(dir, 'Chill', 'Deep', 'nested.wav'), ''),
      // Should all be ignored:
      writeFile(join(dir, 'notes.txt'), ''),
      writeFile(join(dir, 'artwork.jpg'), ''),
      writeFile(join(dir, '.hidden.mp3'), ''),
    ]);
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('finds audio files recursively, including nested folders', async () => {
    const titles = (await scanDirectory(dir)).map((e) => e.title).sort();
    assert.deepEqual(titles, [
      'Homer_Let_The_Barts_Out',
      'Some Song (Live)',
      'Thunder Road',
      'evening-calm',
      'nested',
    ]);
  });

  test('ignores non-audio and dot files', async () => {
    const titles = (await scanDirectory(dir)).map((e) => e.title);
    assert.ok(!titles.some((t) => ['notes', 'artwork', '.hidden'].includes(t)));
  });

  test('titles drop the extension and paths are absolute', async () => {
    const found = await scanDirectory(dir);
    const thunder = found.find((e) => e.title === 'Thunder Road');
    assert.ok(thunder, 'expected to find Thunder Road');
    assert.equal(thunder.path, join(dir, 'Rock', 'Thunder Road.flac'));
  });

  test('returns nothing for a directory that does not exist', async () => {
    assert.deepEqual(await scanDirectory(join(dir, 'nope')), []);
  });

  test('stops descending past the depth limit', async () => {
    assert.deepEqual(await scanDirectory(dir, 9), []);
  });
});

describe('rankEntries', () => {
  const entries = [
    entry('Homer_Let_The_Barts_Out'),
    entry('Thunder Road'),
    entry('evening-calm'),
    entry('Thunder Struck'),
  ];

  test('matches ignoring case, underscores and hyphens', () => {
    // The separators in a filename shouldn't have to be typed out.
    assert.equal(rankEntries(entries, 'homer')[0]?.title, 'Homer_Let_The_Barts_Out');
    assert.equal(rankEntries(entries, 'evening calm')[0]?.title, 'evening-calm');
    assert.equal(rankEntries(entries, 'THUNDER ROAD')[0]?.title, 'Thunder Road');
  });

  test('matches a mid-title substring', () => {
    assert.equal(rankEntries(entries, 'barts out')[0]?.title, 'Homer_Let_The_Barts_Out');
  });

  test('ranks an exact title above a prefix match', () => {
    const ranked = rankEntries([entry('Thunder'), entry('Thunder Road')], 'thunder');
    assert.equal(ranked[0]?.title, 'Thunder');
  });

  test('returns nothing when there is no match', () => {
    assert.deepEqual(rankEntries(entries, 'nonexistent song'), []);
  });

  test('an empty query lists everything, so autocomplete opens populated', () => {
    assert.equal(rankEntries(entries, '').length, entries.length);
  });

  test('respects the limit', () => {
    assert.equal(rankEntries(entries, '', 2).length, 2);
  });
});
