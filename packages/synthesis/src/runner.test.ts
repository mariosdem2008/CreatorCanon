/**
 * Tests for the synthesis runner.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { runSynthesis } from './runner';
import type {
  CanonRef,
  ChannelProfileRef,
  CodexClient,
  CreatorConfig,
} from './types';

function makeMockCodex(): CodexClient {
  return {
    run: async (prompt: string) => {
      // Single mock that satisfies every composer's expected JSON shape.
      if (prompt.includes('successCriterion')) {
        return JSON.stringify({
          title: 'Step',
          description: 'Do the thing.',
          durationLabel: 'this week',
          successCriterion: 'It works.',
        });
      }
      if (prompt.includes('outro')) return JSON.stringify({ text: 'Outro CTA.' });
      if (prompt.includes('intro for an operator-coach action plan')) {
        return JSON.stringify({ text: 'Intro copy.' });
      }
      if (prompt.includes('intro for an operator-coach diagnostic')) {
        return JSON.stringify({ text: 'Diagnostic intro.' });
      }
      if (prompt.includes('worksheet')) {
        return JSON.stringify({
          setupQuestion: 'Setup?',
          outputRubric: 'You know it works when...',
          estimatedMinutes: 10,
        });
      }
      if (prompt.includes('calculator')) {
        return JSON.stringify({
          title: 'Calc',
          description: 'desc',
          variables: [
            { id: 'a', label: 'A', type: 'currency', defaultValue: 10 },
            { id: 'b', label: 'B', type: 'integer', defaultValue: 5 },
          ],
          formula: 'a * b',
          outputLabel: 'Out',
          outputUnit: '$',
          interpretation: 'It means X.',
        });
      }
      if (prompt.includes('lead capture')) {
        return JSON.stringify({
          label: 'Get it',
          submitText: 'Send',
          thankyouText: 'Done.',
        });
      }
      if (prompt.includes('inline CTAs')) {
        return JSON.stringify({
          ctas: [
            { pageDepth: 'shallow', text: 'Try', href: '/x' },
            { pageDepth: 'mid', text: 'Get', href: '/x' },
            { pageDepth: 'deep', text: 'Join', href: '/x' },
          ],
        });
      }
      if (prompt.includes('share-card')) {
        return JSON.stringify({ title: 'T', quote: 'Q' });
      }
      if (prompt.includes('multi-choice diagnostic questions')) {
        return JSON.stringify({
          questions: [
            {
              id: 'q1',
              text: 'Where?',
              options: [{ label: 'Here', value: 'general', weight: 1 }],
            },
          ],
        });
      }
      return JSON.stringify({});
    },
  };
}

function fixtureCanons(): CanonRef[] {
  return [
    {
      id: 'fw1',
      payload: {
        type: 'framework',
        title: 'Niche down',
        body:
          '## Pick the niche\nYou earn the right to niche down. $10K month requires focus. 3:1 LTV to CAC means good unit economics. Pre-revenue: scattergun is the enemy.',
      },
    },
    {
      id: 'fw2',
      payload: {
        type: 'framework',
        title: 'Scale',
        body:
          '## Delegate\nDelegate by design. Run 60+ locations with $1M months. Cold outreach gives 5x ROI. Premium tier $25,000.',
      },
    },
    {
      id: 'a1',
      payload: { type: 'aphorism', title: 'Pithy', body: 'You earn the right to niche down.' },
    },
  ];
}

describe('runSynthesis (integration with mocked Codex)', () => {
  test('produces a complete operator-coach ProductBundle', async () => {
    const channelProfile: ChannelProfileRef = {
      archetype: 'operator-coach',
      voiceMode: 'first_person',
      creatorName: 'Test',
      niche: 'business operators',
      _index_audience_jobs: [
        { id: 'acquire', label: 'Acquire customers', tags: ['acquisition'] },
      ],
    };
    const creatorConfig: CreatorConfig = {
      brand: { primaryColor: '#000' },
      ctas: { primary: { label: 'Start', href: '/' } },
    };
    const bundle = await runSynthesis({
      runId: 'r1',
      productGoal: 'lead_magnet',
      creatorConfig,
      channelProfile,
      canons: fixtureCanons(),
      codex: makeMockCodex(),
    });
    assert.equal(bundle.archetype, 'operator-coach');
    assert.equal(bundle.voiceMode, 'first_person');
    assert.equal(bundle.productGoal, 'lead_magnet');
    assert.equal(bundle.schemaVersion, 'product_bundle_v1');
    assert.ok(bundle.components.actionPlan);
    assert.ok(bundle.components.worksheets);
    assert.ok(bundle.components.calculators);
    assert.ok(bundle.components.diagnostic);
    assert.ok(bundle.components.funnel);
    assert.ok(bundle.generatedAt.length > 0);
  });

  test('only emits funnel when archetype is _DEFAULT', async () => {
    const channelProfile: ChannelProfileRef = {
      archetype: '_DEFAULT',
      voiceMode: 'first_person',
      creatorName: 'Test',
    };
    const creatorConfig: CreatorConfig = {
      brand: { primaryColor: '#000' },
      ctas: {},
    };
    const bundle = await runSynthesis({
      runId: 'r1',
      productGoal: 'lead_magnet',
      creatorConfig,
      channelProfile,
      canons: fixtureCanons(),
      codex: makeMockCodex(),
    });
    assert.equal(bundle.archetype, '_DEFAULT');
    assert.equal(bundle.components.actionPlan, undefined);
    assert.equal(bundle.components.worksheets, undefined);
    assert.equal(bundle.components.calculators, undefined);
    assert.equal(bundle.components.diagnostic, undefined);
    assert.ok(bundle.components.funnel);
  });
});
