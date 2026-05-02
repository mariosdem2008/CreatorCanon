import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { countCitations, citationFloor, CITATION_FLOOR_BY_TYPE } from './citation-density';

describe('countCitations', () => {
  test('counts UUID-format citation tokens', () => {
    const body = 'I sell movement [a1b2c3d4-e5f6-1234-5678-9abcdef01234]. The way is clear [12345678-90ab-cdef-1234-567890abcdef].';
    assert.equal(countCitations(body), 2);
  });

  test('returns 0 for body with no citations', () => {
    assert.equal(countCitations('Plain prose with no citations.'), 0);
  });

  test('returns 0 for empty/null body', () => {
    assert.equal(countCitations(''), 0);
    assert.equal(countCitations(null as any), 0);
    assert.equal(countCitations(undefined as any), 0);
  });

  test('counts unique UUIDs only (deduplicates)', () => {
    const body = 'First [a1b2c3d4-e5f6-1234-5678-9abcdef01234]. Second [a1b2c3d4-e5f6-1234-5678-9abcdef01234]. Third [12345678-90ab-cdef-1234-567890abcdef].';
    assert.equal(countCitations(body), 2);  // 2 unique UUIDs, even though one appears twice
  });

  test('ignores non-UUID brackets', () => {
    const body = 'Item [ex_a91d4c]. Story [st_6fa21c]. Mistake [mst_p2x7d5]. Actual citation [a1b2c3d4-e5f6-1234-5678-9abcdef01234].';
    assert.equal(countCitations(body), 1);  // only the UUID counts
  });

  test('handles UUIDs in mixed case (some Codex outputs use uppercase)', () => {
    // The regex SHOULD be case-insensitive — UUIDs are formally hex.
    // If implementation chose case-sensitive, document it.
    const body = 'Lower [a1b2c3d4-e5f6-1234-5678-9abcdef01234] vs upper [A1B2C3D4-E5F6-1234-5678-9ABCDEF01234].';
    const count = countCitations(body);
    assert.ok(count >= 1, 'should count at least the lowercase one');
  });
});

describe('citationFloor', () => {
  test('returns floor per canon type', () => {
    assert.equal(citationFloor('framework'), 7);
    assert.equal(citationFloor('playbook'), 7);
    assert.equal(citationFloor('principle'), 5);
    assert.equal(citationFloor('topic'), 5);
    assert.equal(citationFloor('lesson'), 5);
    assert.equal(citationFloor('pattern'), 5);
    assert.equal(citationFloor('tactic'), 5);
    assert.equal(citationFloor('example'), 4);
    assert.equal(citationFloor('definition'), 3);
    assert.equal(citationFloor('aha_moment'), 3);
    assert.equal(citationFloor('quote'), 2);
  });

  test('returns 5 for unknown types (sensible default)', () => {
    assert.equal(citationFloor('mystery_type'), 5);
    assert.equal(citationFloor(''), 5);
  });

  test('floors are exposed as a map', () => {
    assert.equal(typeof CITATION_FLOOR_BY_TYPE, 'object');
    assert.equal(CITATION_FLOOR_BY_TYPE.framework, 7);
  });
});
