import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { describeSoundError } from './soundErrors';

describe('describeSoundError', () => {
  test('names a genuine permission failure', () => {
    for (const code of [50013, 50001]) {
      const message = describeSoundError(Object.assign(new Error('Missing Permissions'), { code }));
      assert.match(message, /Permissions manquantes/);
    }
  });

  test('reports a voice connection timeout as such', () => {
    const aborted = Object.assign(new Error('The operation was aborted'), { code: 'ABORT_ERR' });
    assert.match(describeSoundError(aborted), /timeout/i);
  });

  test('does not blame permissions for unrelated failures', () => {
    // The original bug: every failure claimed to be a permissions problem,
    // which sent people checking roles that were already correct.
    const message = describeSoundError(new Error('Unknown Sound'));
    assert.ok(!/Permissions manquantes/.test(message));
    assert.match(message, /Unknown Sound/);
  });

  test('handles a non-Error value', () => {
    assert.match(describeSoundError('boom'), /boom/);
  });

  test('caps a very long message', () => {
    const message = describeSoundError(new Error('x'.repeat(1000)));
    assert.ok(message.length < 400, `message was ${message.length} chars`);
  });
});
