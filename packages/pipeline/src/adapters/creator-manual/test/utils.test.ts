import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../utils';

describe('creator-manual utils', () => {
  it('slugify trims separators after truncating long titles', () => {
    const slug = slugify(`${'a'.repeat(59)} title`);

    assert.equal(slug.endsWith('-'), false);
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('slugify falls back when normalization removes every character', () => {
    assert.equal(slugify('---', 'fallback'), 'fallback');
  });
});
