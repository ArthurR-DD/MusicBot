import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { shuffle } from './radio';

describe('shuffle', () => {
  test('keeps every element exactly once', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffle(input);
    assert.equal(out.length, input.length);
    assert.deepEqual([...out].sort((a, b) => a - b), input);
  });

  test('does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    shuffle(input);
    assert.deepEqual(input, copy);
  });

  test('handles empty and single-element lists', () => {
    assert.deepEqual(shuffle([]), []);
    assert.deepEqual(shuffle(['only']), ['only']);
  });

  test('actually reorders across repeated runs', () => {
    // A shuffle that always returned the input order would still pass the
    // checks above, so assert that some run differs. With 10 elements the odds
    // of 20 identity permutations are vanishingly small.
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const reordered = Array.from({ length: 20 }, () => shuffle(input)).some(
      (out) => !out.every((v, i) => v === input[i]),
    );
    assert.ok(reordered, 'expected at least one run to differ from the input order');
  });
});
