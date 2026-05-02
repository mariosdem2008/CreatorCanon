/**
 * Tests for theme-curator.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeThemes,
  clusterByEmbedding,
  type Embedder,
} from './theme-curator';
import type { AphorismCard, CodexClient } from '../types';

/**
 * A deterministic mock embedder for tests. Each input string is hashed
 * to a 4-d vector. Strings sharing keywords (e.g. "money") get nearby
 * vectors, so the cluster pass groups them.
 */
function makeMockEmbedder(): Embedder {
  function hashFor(text: string): number[] {
    const lc = text.toLowerCase();
    return [
      /money|earn|cash|pay/.test(lc) ? 1 : 0,
      /work|focus|niche|do|ship/.test(lc) ? 1 : 0,
      /no|yes|choose|decide/.test(lc) ? 1 : 0,
      /love|relationships|friends/.test(lc) ? 1 : 0,
    ];
  }
  return {
    embed: async (texts) => texts.map(hashFor),
  };
}

function makeMockCodex(): CodexClient {
  return {
    run: async (prompt) => {
      if (prompt.includes('Name a single theme')) {
        if (prompt.includes('money')) {
          return JSON.stringify({ name: 'Money', description: 'Lines on what you earn and what you spend.' });
        }
        if (prompt.includes('focus') || prompt.includes('work')) {
          return JSON.stringify({ name: 'Work', description: 'Lines on doing the work.' });
        }
        if (prompt.includes('choose') || prompt.includes('decide') || prompt.includes('no')) {
          return JSON.stringify({ name: 'Decision making', description: 'Lines on choosing.' });
        }
        return JSON.stringify({ name: 'Reflections', description: 'Misc lines.' });
      }
      return JSON.stringify({});
    },
  };
}

function card(id: string, text: string): AphorismCard {
  return {
    id,
    text,
    themeTags: [],
    whyThisMatters: '',
    sourceCanonId: id,
  };
}

describe('clusterByEmbedding', () => {
  test('groups vectors by cosine similarity threshold', () => {
    const items = [
      { id: 'a', vector: [1, 0, 0, 0] },
      { id: 'b', vector: [0.9, 0, 0.1, 0] },
      { id: 'c', vector: [0, 1, 0, 0] },
      { id: 'd', vector: [0, 0.95, 0.05, 0] },
    ];
    const clusters = clusterByEmbedding(items, { similarityThreshold: 0.8 });
    // Two clusters expected.
    assert.equal(clusters.length, 2);
    const sortedSets = clusters.map((c) => c.itemIds.sort().join(',')).sort();
    assert.deepEqual(sortedSets, ['a,b', 'c,d']);
  });

  test('singleton clusters when nothing is similar', () => {
    const items = [
      { id: 'a', vector: [1, 0, 0, 0] },
      { id: 'b', vector: [0, 1, 0, 0] },
    ];
    const clusters = clusterByEmbedding(items, { similarityThreshold: 0.9 });
    assert.equal(clusters.length, 2);
  });

  test('returns empty when no items', () => {
    assert.deepEqual(clusterByEmbedding([], { similarityThreshold: 0.5 }), []);
  });
});

describe('composeThemes (with mocked Embedder + Codex)', () => {
  test('emits 1 theme per cluster, naming via Codex', async () => {
    const cards: AphorismCard[] = [
      card('c1', 'Cash is oxygen for the business.'),
      card('c2', 'Earn first, optimise later.'),
      card('c3', 'Niche down before you scale up.'),
      card('c4', 'Focus is a forcing function.'),
      card('c5', 'Hell yeah or no.'),
      card('c6', 'A no spoken in time is a yes you can keep.'),
    ];
    const themes = await composeThemes(cards, {
      embedder: makeMockEmbedder(),
      codex: makeMockCodex(),
      similarityThreshold: 0.6,
    });

    assert.ok(themes.length >= 2);
    for (const t of themes) {
      assert.ok(t.id);
      assert.ok(t.name.length > 0);
      assert.ok(t.description.length > 0);
      assert.ok(t.cardIds.length > 0);
    }

    // Cards should be partitioned across themes (each card in exactly one).
    const seen = new Set<string>();
    for (const t of themes) {
      for (const id of t.cardIds) {
        assert.ok(!seen.has(id), `card ${id} appears in multiple themes`);
        seen.add(id);
      }
    }
    assert.equal(seen.size, cards.length);
  });

  test('back-fills card.themeTags with theme names', async () => {
    const cards: AphorismCard[] = [
      card('c1', 'Cash is oxygen.'),
      card('c2', 'Hell yeah or no.'),
    ];
    const themes = await composeThemes(cards, {
      embedder: makeMockEmbedder(),
      codex: makeMockCodex(),
      similarityThreshold: 0.5,
    });
    // After composeThemes returns, the input cards array's themeTags is
    // mutated — composer back-fills theme names onto the card metadata.
    for (const c of cards) {
      assert.ok(c.themeTags.length > 0, `card ${c.id} has no themeTags`);
    }
    // Sanity: every theme name appears on at least one card.
    const allTags = new Set(cards.flatMap((c) => c.themeTags));
    for (const t of themes) {
      assert.ok(allTags.has(t.name), `theme ${t.name} not back-filled onto any card`);
    }
  });

  test('returns empty array when no cards', async () => {
    const themes = await composeThemes([], {
      embedder: makeMockEmbedder(),
      codex: makeMockCodex(),
    });
    assert.deepEqual(themes, []);
  });

  test('caps clusters at maxThemes (default 12)', async () => {
    // Build 20 cards each with a unique signature -> 20 singletons.
    const cards: AphorismCard[] = Array.from({ length: 20 }, (_, i) =>
      card(`c${i}`, `unique signature ${i}`),
    );
    // Embedder gives each one an orthogonal vector — every cluster a singleton.
    const orthogonal: Embedder = {
      embed: async (texts) =>
        texts.map((_, i) => {
          const v = Array.from({ length: 20 }, () => 0);
          v[i] = 1;
          return v;
        }),
    };
    const themes = await composeThemes(cards, {
      embedder: orthogonal,
      codex: makeMockCodex(),
      similarityThreshold: 0.99,
      maxThemes: 5,
    });
    assert.ok(themes.length <= 5);
  });
});
