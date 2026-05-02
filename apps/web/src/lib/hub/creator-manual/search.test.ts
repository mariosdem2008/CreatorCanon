import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { searchCreatorManual } from './search';
import { sampleCreatorManualManifest } from './sampleManifest';

test('search returns deterministic title matches above summary and body matches', () => {
  const results = searchCreatorManual(sampleCreatorManualManifest, 'evidence');
  const bodyOnlyMatch = results.find((result) => result.doc.id === 'search-source-positioning');

  assert.ok(results[0]);
  assert.ok(bodyOnlyMatch);
  assert.equal(results[0].doc.title, 'Evidence improves decisions');
  assert.equal(results[0].score > bodyOnlyMatch.score, true);
  assert.deepEqual(
    searchCreatorManual(sampleCreatorManualManifest, 'evidence').map((result) => result.doc.id),
    results.map((result) => result.doc.id),
  );
});

test('search supports type filtering', () => {
  const results = searchCreatorManual(sampleCreatorManualManifest, 'evidence', { types: ['claim'] });

  assert.equal(results.length > 0, true);
  assert.equal(results.every((result) => result.doc.type === 'claim'), true);
  assert.ok(results[0]);
  assert.equal(results[0].doc.id, 'search-claim-evidence');
});

test('search returns scoped routes for all record families', () => {
  const cases = [
    ['offer', 'node', '/h/creator-manual-preview/library#offer-lens'],
    ['positioning', 'pillar', '/h/creator-manual-preview/pillars/positioning'],
    ['roundtable', 'source', '/h/creator-manual-preview/sources/src-positioning-roundtable'],
    ['capture log', 'segment', '/h/creator-manual-preview/segments/seg-capture-log'],
    ['specificity', 'claim', '/h/creator-manual-preview/claims#claim-specificity-builds-trust'],
    ['offer lens', 'glossary', '/h/creator-manual-preview/glossary#offer-lens'],
    ['clarity', 'theme', '/h/creator-manual-preview/themes/clarity'],
    ['map audience', 'workshop', '/h/creator-manual-preview/workshop/map-audience'],
  ] as const;

  for (const [query, type, route] of cases) {
    const [result] = searchCreatorManual(sampleCreatorManualManifest, query, { types: [type] });
    assert.ok(result);
    assert.equal(result.route, route);
  }
});

test('search returns an empty result set for blank or unmatched queries', () => {
  assert.deepEqual(searchCreatorManual(sampleCreatorManualManifest, '   '), []);
  assert.deepEqual(searchCreatorManual(sampleCreatorManualManifest, 'zzzzzzzz'), []);
});
