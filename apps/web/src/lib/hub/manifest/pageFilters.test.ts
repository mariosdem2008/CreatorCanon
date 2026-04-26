// apps/web/src/lib/hub/manifest/pageFilters.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { filterPages, sortPages } from './pageFilters';
import { mockManifest } from './mockManifest';

const pages = mockManifest.pages;

test('filterPages: empty filters returns all', () => {
  assert.equal(filterPages(pages, { query: '', types: [], topicSlugs: [] }).length, pages.length);
});

test('filterPages: query matches title and summaryPlainText', () => {
  const r = filterPages(pages, { query: 'feynman', types: [], topicSlugs: [] });
  assert.ok(r.some((p) => p.slug === 'feynman-technique'));
});

test('filterPages: types restricts result set', () => {
  const r = filterPages(pages, { query: '', types: ['playbook'], topicSlugs: [] });
  assert.ok(r.length > 0);
  for (const p of r) assert.equal(p.type, 'playbook');
});

test('filterPages: topicSlugs restricts result set', () => {
  const r = filterPages(pages, { query: '', types: [], topicSlugs: ['learning'] });
  assert.ok(r.length > 0);
  for (const p of r) assert.ok(p.topicSlugs.includes('learning'));
});

test('sortPages: newest first by updatedAt', () => {
  const r = sortPages(pages, 'newest');
  for (let i = 1; i < r.length; i++) {
    assert.ok(new Date(r[i - 1]!.updatedAt) >= new Date(r[i]!.updatedAt));
  }
});

test('sortPages: most-cited first by citationCount', () => {
  const r = sortPages(pages, 'most-cited');
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i - 1]!.citationCount >= r[i]!.citationCount);
  }
});
