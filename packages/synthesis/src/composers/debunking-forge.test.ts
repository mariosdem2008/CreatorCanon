/**
 * Tests for debunking-forge.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeDebunking,
  detectDebunkingCanon,
} from './debunking-forge';
import type { CanonRef, CodexClient, ComposeInput } from '../types';

describe('detectDebunkingCanon', () => {
  test('matches body language: "the myth is..."', () => {
    const c: CanonRef = {
      id: 'c1',
      payload: { body: 'The myth is that seed oils cause inflammation.' },
    };
    assert.equal(detectDebunkingCanon(c), true);
  });

  test('matches "actually, the data shows"', () => {
    const c: CanonRef = {
      id: 'c1',
      payload: { body: 'Actually, the data shows seed oils are tolerated.' },
    };
    assert.equal(detectDebunkingCanon(c), true);
  });

  test('matches voice fingerprint: fearmongering', () => {
    const c: CanonRef = {
      id: 'c1',
      payload: {
        body: 'Body text.',
        _index_voice_fingerprint: { rhetoricalMoves: ['fearmongering-pushback'] },
      },
    };
    assert.equal(detectDebunkingCanon(c), true);
  });

  test('returns false for plain claim canon', () => {
    const c: CanonRef = {
      id: 'c1',
      payload: { body: 'Vitamin D is essential.' },
    };
    assert.equal(detectDebunkingCanon(c), false);
  });

  test('matches type debunking explicitly', () => {
    const c: CanonRef = {
      id: 'c1',
      payload: { type: 'debunking', body: 'b' },
    };
    assert.equal(detectDebunkingCanon(c), true);
  });
});

function makeMockCodex(): CodexClient {
  return {
    run: async (prompt: string) => {
      if (prompt.includes('debunking item')) {
        return JSON.stringify({
          myth: 'Seed oils cause systemic inflammation.',
          reality:
            'Controlled trials show no biomarker shifts at typical dietary intake; the inflammation narrative comes from extrapolating cell-culture data.',
        });
      }
      return JSON.stringify({});
    },
  };
}

function baseInput(canons: CanonRef[]): ComposeInput {
  return {
    runId: 'r1',
    canons,
    channelProfile: {
      archetype: 'science-explainer',
      voiceMode: 'third_person_editorial',
      creatorName: 'Test Scientist',
    },
    voiceMode: 'third_person_editorial',
    creatorName: 'Test Scientist',
  };
}

describe('composeDebunking (with mocked Codex)', () => {
  test('emits one DebunkingItem per debunking canon', async () => {
    const canons: CanonRef[] = [
      {
        id: 'd1',
        payload: {
          type: 'claim',
          title: 'Seed oils myth',
          body: 'The myth is that seed oils cause inflammation. The data shows otherwise.',
        },
      },
      {
        id: 'd2',
        payload: {
          type: 'debunking',
          title: 'Sleep tracker myth',
          body: 'Actually, sleep tracker scores barely correlate with PSG results.',
        },
      },
      {
        id: 'a1',
        payload: { type: 'aphorism', title: 'Skip me', body: 'Quote.' },
      },
    ];

    const result = await composeDebunking(baseInput(canons), {
      codex: makeMockCodex(),
    });

    assert.equal(result.items.length, 2);
    assert.ok(result.items.every((it) => it.id.startsWith('myth_')));
    const first = result.items[0];
    assert.ok(first);
    assert.ok(first.primaryEvidenceCanonIds.length > 0);
    assert.ok(first.myth.length > 0);
    assert.ok(first.reality.length > 0);
  });

  test('returns empty items when no debunking canons present', async () => {
    const canons: CanonRef[] = [
      { id: 'a1', payload: { type: 'aphorism', body: 'A pithy quote.' } },
      { id: 'c1', payload: { type: 'claim', body: 'Just a claim, no myth.' } },
    ];
    const result = await composeDebunking(baseInput(canons), {
      codex: makeMockCodex(),
    });
    assert.equal(result.items.length, 0);
  });

  test('honors max items cap to keep Codex calls bounded', async () => {
    const canons: CanonRef[] = Array.from({ length: 30 }, (_, i) => ({
      id: `d${i}`,
      payload: {
        type: 'debunking',
        title: `Myth ${i}`,
        body: `The myth is X${i}. Actually, the data shows Y.`,
      },
    }));
    const result = await composeDebunking(baseInput(canons), {
      codex: makeMockCodex(),
    });
    // Cap at 20 by default; tunable via maxItems if needed.
    assert.ok(result.items.length <= 20, `expected <= 20, got ${result.items.length}`);
  });
});
