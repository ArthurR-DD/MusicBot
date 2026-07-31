import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type MarkStore, applyToggle } from './marks';

describe('applyToggle', () => {
  test('marks a user who was not marked', () => {
    const { store, marked } = applyToggle({}, 'g1', 'u1');
    assert.equal(marked, true);
    assert.deepEqual(store, { g1: ['u1'] });
  });

  test('unmarks on a second toggle', () => {
    const first = applyToggle({}, 'g1', 'u1');
    const second = applyToggle(first.store, 'g1', 'u1');
    assert.equal(second.marked, false);
    assert.deepEqual(second.store, {});
  });

  test('keeps other marked users when one is removed', () => {
    const store: MarkStore = { g1: ['u1', 'u2'] };
    const { store: next, marked } = applyToggle(store, 'g1', 'u1');
    assert.equal(marked, false);
    assert.deepEqual(next, { g1: ['u2'] });
  });

  test('keeps guilds separate', () => {
    const store: MarkStore = { g1: ['u1'] };
    const { store: next } = applyToggle(store, 'g2', 'u1');
    assert.deepEqual(next, { g1: ['u1'], g2: ['u1'] });
  });

  test('drops a guild key once its last mark is removed', () => {
    // Otherwise the file accumulates empty arrays for guilds forever.
    const { store } = applyToggle({ g1: ['u1'], g2: ['u2'] }, 'g1', 'u1');
    assert.deepEqual(store, { g2: ['u2'] });
    assert.ok(!('g1' in store));
  });

  test('does not mutate the input store', () => {
    const store: MarkStore = { g1: ['u1'] };
    const snapshot = JSON.stringify(store);
    applyToggle(store, 'g1', 'u2');
    applyToggle(store, 'g1', 'u1');
    assert.equal(JSON.stringify(store), snapshot);
  });
});
