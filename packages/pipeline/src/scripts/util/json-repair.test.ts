import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { repairTruncatedJson } from './json-repair';

describe('repairTruncatedJson', () => {
  test('returns parsed value when input is already valid JSON object', () => {
    assert.deepEqual(repairTruncatedJson('{"a": 1, "b": 2}'), { a: 1, b: 2 });
  });

  test('returns parsed value when input is already valid JSON array', () => {
    assert.deepEqual(repairTruncatedJson('[{"a":1},{"b":2}]'), [{ a: 1 }, { b: 2 }]);
  });

  test('handles trailing comma after the last entry', () => {
    assert.deepEqual(repairTruncatedJson('{"a": 1, "b": 2,}'), { a: 1, b: 2 });
  });

  test('recovers a truncated array by dropping the unterminated last entry', () => {
    // Codex truncated mid-string in the second array element.
    // The new algorithm recovers the partial second entry ({"a":3}) from the
    // comma between fields, so the result has 2 elements, not 1.
    const truncated = '[{"a":1, "b":2}, {"a":3, "b":"hello wor';
    const result = repairTruncatedJson(truncated) as Array<unknown>;
    assert.equal(result.length, 2);
    assert.deepEqual(result[0], { a: 1, b: 2 });
    assert.deepEqual(result[1], { a: 3 });
  });

  test('recovers a truncated object by dropping the unterminated last key/value pair', () => {
    // Codex truncated mid-value in the third key
    const truncated = '{"a": 1, "b": 2, "c": "hello wor';
    const result = repairTruncatedJson(truncated) as Record<string, unknown>;
    assert.equal(result.a, 1);
    assert.equal(result.b, 2);
    assert.equal(result.c, undefined);
  });

  test('returns null when input is unrepairable garbage', () => {
    assert.equal(repairTruncatedJson('not json at all'), null);
  });

  test('recovers a truncated registry by dropping the unterminated last entry (depth-2 commas)', () => {
    // The real-world Codex shape: single-key top-level object, entries at depth 2.
    const truncated = '{"registry": {"u1": {"phrase":"hello"}, "u2": {"phrase":"hello wor';
    const result = repairTruncatedJson(truncated) as { registry?: Record<string, unknown> };
    assert.ok(result?.registry, 'registry should be recovered');
    assert.equal(Object.keys(result.registry).length, 1);
    assert.deepEqual(result.registry.u1, { phrase: 'hello' });
  });

  test('recovers a truncation inside a deeply nested entry (depth-3 commas)', () => {
    // Truncation inside u1's body — the comma between fields a and b lets us recover {a: 1}.
    const truncated = '{"registry": {"u1": {"a": 1, "b": "hello wor';
    const result = repairTruncatedJson(truncated) as { registry?: Record<string, unknown> };
    assert.ok(result?.registry);
    assert.deepEqual(result.registry, { u1: { a: 1 } });
  });

  test('returns null when single-entry registry is truncated with no commas anywhere', () => {
    // No comma exists, nothing to truncate back to.
    const truncated = '{"registry": {"u1": {"phrase":"hello wor';
    assert.equal(repairTruncatedJson(truncated), null);
  });

  test('handles array-of-objects truncation inside a wrapper object (mixed depth)', () => {
    const truncated = '{"items": [{"a":1}, {"a":2}, {"a":"hello wor';
    const result = repairTruncatedJson(truncated) as { items?: Array<unknown> };
    assert.ok(result?.items);
    assert.equal(result.items.length, 2);
    assert.deepEqual(result.items[1], { a: 2 });
  });
});
