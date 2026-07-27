import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { safeName, uniquePath } from './filenames';

describe('safeName', () => {
  test('keeps ordinary names intact', () => {
    // Spaces, hyphens and underscores are legitimate in track names — an
    // over-eager filter silently mangling them is easy to miss.
    assert.equal(safeName('Thunder Road'), 'Thunder Road');
    assert.equal(safeName('ok-name_v2'), 'ok-name_v2');
    assert.equal(safeName('Song 2 (Live)'), 'Song 2 (Live)');
  });

  test('strips directory components from traversal attempts', () => {
    assert.equal(safeName('../../etc/passwd'), 'passwd');
    assert.equal(safeName('../../../root/.ssh/authorized_keys'), 'authorized_keys');
    assert.equal(safeName('/etc/shadow'), 'shadow');
    assert.equal(safeName('sub/dir/track'), 'track');
  });

  test('rejects names that are only dots or blank', () => {
    // These must come back empty so the caller refuses the name.
    for (const raw of ['..', '.', '...', '', '   ']) {
      assert.equal(safeName(raw), '', `expected ${JSON.stringify(raw)} to be rejected`);
    }
  });

  test('does not allow hidden files', () => {
    assert.equal(safeName('.hidden'), 'hidden');
    assert.equal(safeName('.bashrc'), 'bashrc');
  });

  test('removes path-significant and control characters', () => {
    assert.equal(safeName('Song: The "Best" <One>'), 'Song The Best One');
    assert.equal(safeName('C:\\Windows\\System32\\evil'), 'CWindowsSystem32evil');
    assert.equal(safeName('bad\u0000null\u001fctrl'), 'badnullctrl');
  });

  test('caps the length', () => {
    assert.equal(safeName('a'.repeat(300)).length, 120);
  });

  test('every result stays inside the target directory', () => {
    const dir = '/app/music';
    const attacks = [
      '../../etc/passwd',
      '../../../root/.ssh/authorized_keys',
      '/etc/shadow',
      'sub/dir/track',
      'C:\\Windows\\evil',
      '....//....//escape',
    ];

    for (const raw of attacks) {
      const stem = safeName(raw);
      if (!stem) continue; // rejected outright, nothing to write
      const target = resolve(join(dir, `${stem}.mp3`));
      assert.ok(
        target.startsWith(`${dir}/`),
        `${JSON.stringify(raw)} escaped the library as ${target}`,
      );
    }
  });
});

describe('uniquePath', () => {
  let dir: string;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'filenames-test-'));
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('uses the plain name when nothing is taken', async () => {
    const path = await uniquePath(dir, 'Fresh Track', '.mp3');
    assert.equal(path, join(dir, 'Fresh Track.mp3'));
    assert.ok(isAbsolute(path));
  });

  test('suffixes rather than overwriting an existing file', async () => {
    const first = await uniquePath(dir, 'Same Song', '.mp3');
    await writeFile(first, 'x');
    const second = await uniquePath(dir, 'Same Song', '.mp3');
    await writeFile(second, 'x');
    const third = await uniquePath(dir, 'Same Song', '.mp3');

    assert.equal(first, join(dir, 'Same Song.mp3'));
    assert.equal(second, join(dir, 'Same Song (2).mp3'));
    assert.equal(third, join(dir, 'Same Song (3).mp3'));
  });
});
