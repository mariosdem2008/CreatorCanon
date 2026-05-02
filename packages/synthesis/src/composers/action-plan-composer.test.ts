/**
 * Tests for action-plan-composer. Use only deterministic stubs for the Codex
 * client — never hit the real CLI from unit tests.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyCanonByPhase,
  composeActionPlan,
  topoSortCanons,
} from './action-plan-composer';
import type { CanonRef, CodexClient, ComposeInput } from '../types';

function makeCanon(id: string, type: string, body: string, title?: string, deps?: string[]): CanonRef {
  return {
    id,
    payload: {
      type,
      title: title ?? id,
      body,
      ...(deps ? { _index_dependencies: deps } : {}),
    },
  };
}

describe('classifyCanonByPhase', () => {
  test('classifies pre-revenue keywords', () => {
    const canon = makeCanon(
      'c1',
      'playbook',
      "You pick a niche. You earn the right to niche down. You start scattergun and have no customers yet.",
    );
    assert.equal(classifyCanonByPhase(canon), 'pre_revenue');
  });

  test('classifies sub-$10K month keywords', () => {
    const canon = makeCanon(
      'c2',
      'framework',
      'You want a $10K month. Build the MVP first system to land your first paid customer.',
    );
    assert.equal(classifyCanonByPhase(canon), 'sub_10k_month');
  });

  test('classifies sub-$100K month keywords', () => {
    const canon = makeCanon(
      'c3',
      'framework',
      'Repeatable processes. First hire to scale the team toward $50K-$100K. Build repeatable processes.',
    );
    assert.equal(classifyCanonByPhase(canon), 'sub_100k_month');
  });

  test('classifies scale keywords', () => {
    const canon = makeCanon(
      'c4',
      'framework',
      'You delegate by design. Multiply across 60+ locations and run a scale operator playbook with $1M months.',
    );
    assert.equal(classifyCanonByPhase(canon), 'scale');
  });

  test('falls back to sub_100k for ambiguous content', () => {
    const canon = makeCanon('c5', 'lesson', 'Generic advice without phase markers.');
    assert.equal(classifyCanonByPhase(canon), 'sub_100k_month');
  });
});

describe('topoSortCanons', () => {
  test('orders independent canons stably', () => {
    const a = makeCanon('a', 'framework', 'Body A.');
    const b = makeCanon('b', 'framework', 'Body B.');
    const sorted = topoSortCanons([a, b]);
    assert.equal(sorted.length, 2);
  });

  test('places prerequisite (referenced via _index_dependencies) before dependent', () => {
    const niche = makeCanon('niche', 'framework', 'About picking a niche.', 'Pick a Niche');
    const ladder = makeCanon(
      'ladder',
      'framework',
      'Map your value ladder.',
      'Value Ladder',
      ['niche'],
    );
    const sorted = topoSortCanons([ladder, niche]);
    assert.deepEqual(
      sorted.map((c) => c.id),
      ['niche', 'ladder'],
    );
  });

  test('detects prerequisite via title-mention in body', () => {
    const niche = makeCanon('niche', 'framework', 'About picking a niche.', 'pick a niche');
    const ladder = makeCanon(
      'ladder',
      'framework',
      'Once you pick a niche, you can map your value ladder properly.',
      'Value Ladder',
    );
    const sorted = topoSortCanons([ladder, niche]);
    assert.deepEqual(
      sorted.map((c) => c.id),
      ['niche', 'ladder'],
    );
  });

  test('breaks cycles deterministically by id', () => {
    const a = makeCanon('a', 'framework', 'Body A mentions B.', 'A', ['b']);
    const b = makeCanon('b', 'framework', 'Body B mentions A.', 'B', ['a']);
    const sorted = topoSortCanons([a, b]);
    assert.equal(sorted.length, 2);
  });
});

describe('composeActionPlan (with mocked Codex)', () => {
  function makeMockCodex(): CodexClient {
    let counter = 0;
    return {
      run: async (_prompt: string) => {
        counter += 1;
        // Detect intro/outro vs step prompts cheaply by length signal.
        // Steps include "successCriterion"; intro/outro do not.
        if (_prompt.includes('successCriterion')) {
          return JSON.stringify({
            title: `Step ${counter}`,
            description: 'Do the thing.',
            durationLabel: 'this week',
            successCriterion: 'It works.',
          });
        }
        if (_prompt.includes('outro')) {
          return JSON.stringify({ text: 'Outro CTA copy.' });
        }
        return JSON.stringify({ text: 'Intro copy.' });
      },
    };
  }

  test('produces 4 phases when canons span all stages', async () => {
    const canons: CanonRef[] = [
      makeCanon('p1', 'playbook', 'Pick a niche. Pre-revenue scattergun.'),
      makeCanon('p2', 'framework', 'Land your first $10K month MVP.'),
      makeCanon('p3', 'framework', 'Repeatable processes for first hire.'),
      makeCanon('p4', 'framework', 'Delegate by design across 60+ locations.'),
    ];
    const input: ComposeInput = {
      runId: 'r1',
      canons,
      channelProfile: { creatorName: 'Test', archetype: 'operator-coach' },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const result = await composeActionPlan(input, { codex: makeMockCodex() });
    assert.equal(result.phases.length, 4);
    assert.ok(result.intro.length > 0);
    assert.ok(result.outroCta.length > 0);
    // Phase positions are sequential.
    for (let i = 0; i < result.phases.length; i++) {
      assert.equal(result.phases[i]!.position, i);
    }
  });

  test('skips empty phases', async () => {
    const canons: CanonRef[] = [
      makeCanon('s1', 'framework', 'Delegate by design across 60+ locations.'),
    ];
    const input: ComposeInput = {
      runId: 'r2',
      canons,
      channelProfile: { creatorName: 'Test', archetype: 'operator-coach' },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const result = await composeActionPlan(input, { codex: makeMockCodex() });
    assert.equal(result.phases.length, 1);
    assert.equal(result.phases[0]!.id, 'scale');
  });

  test('filters out non-playbook/framework canon types', async () => {
    const canons: CanonRef[] = [
      makeCanon('keep', 'playbook', 'Pick a niche. Pre-revenue scattergun.'),
      makeCanon('skip', 'aphorism', 'Pre-revenue. Pick a niche.'),
      makeCanon('skip2', 'lesson', 'Pre-revenue. Pick a niche.'),
    ];
    const input: ComposeInput = {
      runId: 'r3',
      canons,
      channelProfile: { creatorName: 'Test', archetype: 'operator-coach' },
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const result = await composeActionPlan(input, { codex: makeMockCodex() });
    const allStepIds = result.phases.flatMap((p) => p.steps.map((s) => s.sourceCanonId));
    assert.deepEqual(allStepIds, ['keep']);
  });
});
