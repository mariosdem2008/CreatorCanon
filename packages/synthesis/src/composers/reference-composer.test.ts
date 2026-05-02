/**
 * Tests for reference-composer.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  composeReference,
  classifyVerdictFromCanon,
  topicSlugFromCanon,
} from './reference-composer';
import type { CanonRef, CodexClient, ComposeInput } from '../types';

describe('classifyVerdictFromCanon', () => {
  test('verificationStatus: confirmed -> supported', () => {
    const v = classifyVerdictFromCanon({
      id: 'c1',
      payload: { _index_verification_status: 'confirmed' },
    });
    assert.equal(v, 'supported');
  });

  test('verificationStatus: contradicted -> contradicted', () => {
    const v = classifyVerdictFromCanon({
      id: 'c1',
      payload: { _index_verification_status: 'contradicted' },
    });
    assert.equal(v, 'contradicted');
  });

  test('verificationStatus: partial -> partially_supported', () => {
    const v = classifyVerdictFromCanon({
      id: 'c1',
      payload: { _index_verification_status: 'partially_confirmed' },
    });
    assert.equal(v, 'partially_supported');
  });

  test('missing status defaults to mixed', () => {
    const v = classifyVerdictFromCanon({ id: 'c1', payload: {} });
    assert.equal(v, 'mixed');
  });

  test('body cue "the data shows" -> supported', () => {
    const v = classifyVerdictFromCanon({
      id: 'c1',
      payload: { body: 'The data shows linoleic acid is well-tolerated.' },
    });
    assert.equal(v, 'supported');
  });
});

describe('topicSlugFromCanon', () => {
  test('uses explicit topic tag if present', () => {
    const slug = topicSlugFromCanon({
      id: 'c1',
      payload: { _index_topic: 'Nutrition / Seed Oils' },
    });
    assert.equal(slug, 'nutrition-seed-oils');
  });

  test('falls back to first audience-job tag', () => {
    const slug = topicSlugFromCanon({
      id: 'c1',
      payload: { _index_audience_job_tags: ['sleep-hygiene', 'circadian'] },
    });
    assert.equal(slug, 'sleep-hygiene');
  });

  test('falls back to "general" when no signals', () => {
    const slug = topicSlugFromCanon({ id: 'c1', payload: { title: 'X' } });
    assert.equal(slug, 'general');
  });
});

function makeMockCodex(): CodexClient {
  return {
    run: async (prompt: string) => {
      if (prompt.includes('evidence card')) {
        return JSON.stringify({
          claim: 'Linoleic acid is not inflammatory in moderate doses.',
          mechanismExplanation:
            'RCT evidence shows no marker elevation at typical dietary intake.',
          caveats: ['Effects may differ at supraphysiological doses.'],
          counterClaim: 'Seed oils cause systemic inflammation.',
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
      niche: 'nutrition science',
    },
    voiceMode: 'third_person_editorial',
    creatorName: 'Test Scientist',
  };
}

describe('composeReference (with mocked Codex)', () => {
  test('produces an EvidenceCard per claim/evidence canon', async () => {
    const canons: CanonRef[] = [
      {
        id: 'c1',
        payload: {
          type: 'claim',
          title: 'Seed oils myth',
          body: 'The data shows seed oils are well-tolerated.',
          _index_verification_status: 'confirmed',
          _index_topic: 'Nutrition / Fats',
        },
      },
      {
        id: 'c2',
        payload: {
          type: 'evidence_review',
          title: 'Sleep meta-analysis',
          body: 'Meta-analyses show 7-9h sleep is optimal.',
          _index_verification_status: 'partially_confirmed',
          _index_topic: 'Sleep',
        },
      },
      {
        id: 'c3',
        payload: { type: 'aphorism', title: 'Skip me', body: 'Not a claim.' },
      },
    ];

    const result = await composeReference(baseInput(canons), {
      codex: makeMockCodex(),
    });

    assert.equal(result.cards.length, 2);
    const ids = result.cards.map((c) => c.id);
    assert.ok(ids.includes('card_c1'));
    assert.ok(ids.includes('card_c2'));

    const c1Card = result.cards.find((c) => c.id === 'card_c1');
    assert.equal(c1Card?.verdict, 'supported');
    assert.ok(c1Card?.studyEvidenceCanonIds.includes('c1'));

    const c2Card = result.cards.find((c) => c.id === 'card_c2');
    assert.equal(c2Card?.verdict, 'partially_supported');
  });

  test('topicIndex groups card ids by topic slug', async () => {
    const canons: CanonRef[] = [
      {
        id: 'c1',
        payload: {
          type: 'claim',
          title: 'A',
          body: 'Body A.',
          _index_topic: 'Nutrition',
        },
      },
      {
        id: 'c2',
        payload: {
          type: 'claim',
          title: 'B',
          body: 'Body B.',
          _index_topic: 'Nutrition',
        },
      },
      {
        id: 'c3',
        payload: {
          type: 'claim',
          title: 'C',
          body: 'Body C.',
          _index_topic: 'Sleep',
        },
      },
    ];

    const result = await composeReference(baseInput(canons), {
      codex: makeMockCodex(),
    });
    assert.deepEqual(result.topicIndex.nutrition?.sort(), ['card_c1', 'card_c2']);
    assert.deepEqual(result.topicIndex.sleep, ['card_c3']);
  });

  test('returns empty cards + index when no eligible canons', async () => {
    const canons: CanonRef[] = [
      { id: 'a1', payload: { type: 'aphorism', title: 'A', body: 'b' } },
    ];
    const result = await composeReference(baseInput(canons), {
      codex: makeMockCodex(),
    });
    assert.equal(result.cards.length, 0);
    assert.deepEqual(result.topicIndex, {});
  });
});
