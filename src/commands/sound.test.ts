import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ownsComponent } from './sound';

describe('ownsComponent', () => {
  test('claims its own select menus', () => {
    assert.ok(ownsComponent('sound:123456789'));
    assert.ok(ownsComponent('sound:'));
  });

  test('leaves other components alone', () => {
    // Routing picks the first command that claims a customId, so a greedy
    // matcher here would swallow another command's menus.
    for (const id of ['', 'other:99', 'queue:next', 'soundalike:1']) {
      assert.ok(!ownsComponent(id), `should not claim ${JSON.stringify(id)}`);
    }
  });
});
