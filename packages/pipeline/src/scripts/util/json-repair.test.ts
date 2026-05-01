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
    // Codex truncated mid-string in the second array element
    const truncated = '[{"a":1, "b":2}, {"a":3, "b":"hello wor';
    const result = repairTruncatedJson(truncated) as Array<unknown>;
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], { a: 1, b: 2 });
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
});
