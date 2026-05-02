/**
 * Tests for claim-search.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { EvidenceCard } from '@creatorcanon/synthesis';
import {
  cosineSimilarity,
  indexEvidenceCards,
  mockHashEmbedder,
  searchClaims,
} from './claim-search';

function card(id: string, claim: string, mechanism = '', caveats: string[] = []): EvidenceCard {
  return {
    id: `card_${id}`,
    claim,
    verdict: 'supported',
    mechanismExplanation: mechanism,
    topic: 'general',
    studyEvidenceCanonIds: [id],
    caveats,
  };
}

describe('cosineSimilarity', () => {
  test('returns 1 for identical vectors', () => {
    const v = [1, 2, 3];
    assert.equal(cosineSimilarity(v, v), 1);
  });
  test('returns 0 for orthogonal vectors', () => {
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });
  test('throws on dimension mismatch', () => {
    assert.throws(() => cosineSimilarity([1, 0], [1, 0, 0]));
  });
  test('returns 0 when either vector is zero-length', () => {
    assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  });
});

describe('mockHashEmbedder', () => {
  test('produces vectors of the requested dimension', async () => {
    const e = mockHashEmbedder(32);
    const v = await e.embed('hello');
    assert.equal(v.length, 32);
  });
  test('is deterministic across calls', async () => {
    const e = mockHashEmbedder(16);
    const v1 = await e.embed('seed oils');
    const v2 = await e.embed('seed oils');
    assert.deepEqual(v1, v2);
  });
  test('different strings yield different vectors', async () => {
    const e = mockHashEmbedder(16);
    const v1 = await e.embed('seed oils');
    const v2 = await e.embed('sleep cycles');
    assert.notDeepEqual(v1, v2);
  });
});

describe('indexEvidenceCards + searchClaims', () => {
  test('exact-text query ranks the matching card first', async () => {
    const embedder = mockHashEmbedder(64);
    const cards = [
      card('c1', 'Linoleic acid is not pro-inflammatory at typical intake'),
      card('c2', 'Magnesium glycinate improves sleep onset for some'),
      card('c3', 'Cold plunges have transient catecholamine spikes'),
    ];
    const index = await indexEvidenceCards(cards, embedder);
    const results = await searchClaims(
      'Linoleic acid is not pro-inflammatory at typical intake',
      index,
      embedder,
      3,
    );
    assert.equal(results[0]?.card.id, 'card_c1');
    assert.equal(results.length, 3);
  });

  test('returns empty array for empty query', async () => {
    const embedder = mockHashEmbedder(16);
    const cards = [card('c1', 'A claim')];
    const index = await indexEvidenceCards(cards, embedder);
    const results = await searchClaims('   ', index, embedder, 3);
    assert.deepEqual(results, []);
  });

  test('topN limits the result count', async () => {
    const embedder = mockHashEmbedder(8);
    const cards = Array.from({ length: 10 }, (_, i) =>
      card(`c${i}`, `Claim number ${i}`),
    );
    const index = await indexEvidenceCards(cards, embedder);
    const results = await searchClaims('Claim', index, embedder, 3);
    assert.equal(results.length, 3);
  });

  test('hits are sorted descending by score', async () => {
    const embedder = mockHashEmbedder(32);
    const cards = [
      card('c1', 'A'),
      card('c2', 'B'),
      card('c3', 'C'),
    ];
    const index = await indexEvidenceCards(cards, embedder);
    const results = await searchClaims('A', index, embedder, 3);
    for (let i = 1; i < results.length; i += 1) {
      const prev = results[i - 1]?.score ?? 0;
      const curr = results[i]?.score ?? 0;
      assert.ok(prev >= curr, `not sorted: ${prev} < ${curr}`);
    }
  });
});
