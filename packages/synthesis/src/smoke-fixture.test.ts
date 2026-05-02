/**
 * Cohort smoke deferred per Phase A directive — Mario triggers live runs.
 * This fixture mimics the Hormozi-style operator-coach substrate so the
 * end-to-end runSynthesis pipeline is exercised with realistic shape +
 * volumes (~30 canon nodes, mix of playbook/framework/aphorism, audience
 * jobs, voice fingerprint) without making any real Codex calls.
 *
 * If any composer regresses on the substrate shape we ship to the cohort,
 * this test will fail and surface it before the live run.
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

function makeStubCodex(): CodexClient {
  return {
    run: async (prompt) => {
      // Step authoring — has 'successCriterion' in the prompt body.
      if (prompt.includes('successCriterion')) {
        return JSON.stringify({
          title: 'Map the Value Ladder',
          description: 'You map every offer from $0 to your high ticket.',
          durationLabel: 'this week',
          successCriterion: 'You can name every offer and its price.',
          estimatedMinutes: 45,
        });
      }
      // Action plan outro
      if (prompt.includes('outro CTA for an operator-coach action plan')) {
        return JSON.stringify({ text: 'Pick the first phase and start it today.' });
      }
      // Action plan intro
      if (prompt.includes('intro for an operator-coach action plan')) {
        return JSON.stringify({
          text: 'This 90-day plan is built from the playbooks. Run it in order; do not skip phases.',
        });
      }
      // Diagnostic intro
      if (prompt.includes('intro for an operator-coach diagnostic')) {
        return JSON.stringify({ text: 'Three quick questions to find your next move.' });
      }
      // Diagnostic questions
      if (prompt.includes('multi-choice diagnostic questions')) {
        return JSON.stringify({
          questions: [
            {
              id: 'q1',
              text: 'Where are you stuck?',
              options: [
                { label: 'Getting customers', value: 'acquire', weight: 1 },
                { label: 'Keeping them', value: 'retain', weight: 1 },
                { label: 'Hiring', value: 'hire', weight: 1 },
              ],
            },
            {
              id: 'q2',
              text: 'How long have you been at it?',
              options: [
                { label: 'Days/weeks', value: 'acquire', weight: 0.5 },
                { label: 'Months', value: 'retain', weight: 0.5 },
                { label: 'Years', value: 'hire', weight: 0.5 },
              ],
            },
          ],
        });
      }
      // Worksheet
      if (prompt.includes('fillable worksheet')) {
        return JSON.stringify({
          setupQuestion: 'Before you begin, write your current monthly revenue.',
          outputRubric: 'Your worksheet works when every row has a number.',
          estimatedMinutes: 20,
        });
      }
      // Calculator
      if (prompt.includes('interactive calculator')) {
        return JSON.stringify({
          title: 'LTV Calculator',
          description: 'Estimate customer lifetime value.',
          variables: [
            { id: 'monthlyRevenue', label: 'Monthly revenue', type: 'currency', defaultValue: 100 },
            { id: 'lifetimeMonths', label: 'Lifetime (months)', type: 'months', defaultValue: 12 },
          ],
          formula: 'monthlyRevenue * lifetimeMonths',
          outputLabel: 'Lifetime value',
          outputUnit: '$',
          interpretation: 'Aim for 3:1 LTV-to-CAC.',
        });
      }
      // Funnel: lead capture
      if (prompt.includes('lead capture')) {
        return JSON.stringify({
          label: 'Get the free playbook',
          submitText: 'Send it',
          thankyouText: 'Check your inbox.',
        });
      }
      // Funnel: paywall
      if (prompt.includes('paywall')) {
        return JSON.stringify({
          tagline: 'Ready for the full plan?',
          bullets: ['Action plan', 'Worksheets', 'Calculators'],
          ctaText: 'Unlock now',
        });
      }
      // Funnel: login
      if (prompt.includes('login')) {
        return JSON.stringify({ headline: 'Members only', ctaText: 'Sign in' });
      }
      // Funnel: inline CTAs
      if (prompt.includes('inline CTAs')) {
        return JSON.stringify({
          ctas: [
            { pageDepth: 'shallow', text: 'Try the playbook', href: '/playbook' },
            { pageDepth: 'mid', text: 'See the calculators', href: '/calc' },
            { pageDepth: 'deep', text: 'Join the list', href: '/list' },
          ],
        });
      }
      // Share card
      if (prompt.includes('share-card')) {
        return JSON.stringify({
          title: 'Niche down before scaling',
          quote: 'You earn the right to niche down by serving everyone first.',
        });
      }
      return JSON.stringify({});
    },
  };
}

function fabricateOperatorCoachSubstrate(): {
  channelProfile: ChannelProfileRef;
  canons: CanonRef[];
} {
  const channelProfile: ChannelProfileRef = {
    archetype: 'operator-coach',
    voiceMode: 'first_person',
    creatorName: 'Test Operator',
    niche: 'business operators',
    _index_audience_jobs: [
      { id: 'acquire', label: 'Acquire customers', tags: ['acquisition', 'sales'] },
      { id: 'retain', label: 'Improve retention', tags: ['retention'] },
      { id: 'hire', label: 'Build a team', tags: ['hire', 'scale'] },
    ],
  };

  const canons: CanonRef[] = [
    // Pre-revenue playbooks/frameworks
    {
      id: 'pre1',
      payload: {
        type: 'playbook',
        title: 'Pick a niche',
        body:
          '## Why niche down\nYou earn the right to niche down. Pre-revenue, scattergun is the enemy. No customers yet means you need focus.\n## How to choose\n- You write down 3 candidates.\n- You commit to one for 90 days.',
        _index_audience_job_tags: ['acquisition'],
      },
    },
    {
      id: 'pre2',
      payload: {
        type: 'framework',
        title: 'First deal in 30 days',
        body:
          'Pre-revenue framework. You are at $0-$1k. The goal: first deal in 30 days. If your CAC is over $200, switch channels.',
        _index_audience_job_tags: ['acquisition'],
      },
    },
    // Sub-$10K month
    {
      id: 's10k1',
      payload: {
        type: 'framework',
        title: 'First $10K month MVP',
        body:
          'You want a $10K month. Build the first system. Land your first paid customer. Average deal $2,500. CAC $400. 4x ROI.',
        _index_audience_job_tags: ['acquisition'],
      },
    },
    {
      id: 's10k2',
      payload: {
        type: 'playbook',
        title: 'Survival playbook',
        body: 'First $10 thousand a month. Survival mode. You ship MVP fast.',
      },
    },
    // Sub-$100K
    {
      id: 's100k1',
      payload: {
        type: 'framework',
        title: 'Repeatable processes',
        body:
          'Repeatable processes for first hire. Scale toward $50K-$100K month. 3:1 LTV to CAC. 70% retention rate. Premium tier $25,000.',
        _index_audience_job_tags: ['retention', 'hire'],
      },
    },
    {
      id: 's100k2',
      payload: {
        type: 'framework',
        title: 'Hire your replacement',
        body: 'First hire. Build repeatable processes. $100K month within reach.',
        _index_audience_job_tags: ['hire'],
      },
    },
    // Scale
    {
      id: 'sc1',
      payload: {
        type: 'framework',
        title: 'Delegate by design',
        body:
          'Delegate by design across 60+ locations. $1M months. Multiply via systems. 5x ROI on cold outreach. Payback 6 months payback.',
        _index_audience_job_tags: ['scale'],
      },
    },
    // Aphorisms (for share cards)
    { id: 'a1', payload: { type: 'aphorism', title: 'Niche before scale', body: 'Niche before scale.' } },
    { id: 'a2', payload: { type: 'aphorism', title: 'Reps over theory', body: 'Reps over theory.' } },
    { id: 'a3', payload: { type: 'aphorism', title: 'Cash is oxygen', body: 'Cash is oxygen.' } },
  ];

  return { channelProfile, canons };
}

describe('Phase A cohort smoke (fixture)', () => {
  test('end-to-end runSynthesis on operator-coach substrate produces a complete bundle', async () => {
    const { channelProfile, canons } = fabricateOperatorCoachSubstrate();
    const creatorConfig: CreatorConfig = {
      brand: { primaryColor: '#0a0a0a' },
      ctas: { primary: { label: 'Start the plan', href: '/start' } },
    };

    const bundle = await runSynthesis({
      runId: 'fixture-run-id',
      productGoal: 'lead_magnet',
      creatorConfig,
      channelProfile,
      canons,
      codex: makeStubCodex(),
    });

    // Envelope
    assert.equal(bundle.archetype, 'operator-coach');
    assert.equal(bundle.voiceMode, 'first_person');
    assert.equal(bundle.productGoal, 'lead_magnet');
    assert.equal(bundle.schemaVersion, 'product_bundle_v1');

    // Action plan: 4 phases (every business stage represented in fixture).
    assert.ok(bundle.components.actionPlan);
    assert.equal(bundle.components.actionPlan.phases.length, 4);
    const phaseIds = bundle.components.actionPlan.phases.map((p) => p.id);
    assert.deepEqual(phaseIds, ['pre_revenue', 'sub_10k_month', 'sub_100k_month', 'scale']);
    for (const phase of bundle.components.actionPlan.phases) {
      assert.ok(phase.steps.length >= 1, `phase ${phase.id} has no steps`);
    }
    assert.ok(bundle.components.actionPlan.intro.length > 0);
    assert.ok(bundle.components.actionPlan.outroCta.length > 0);

    // Worksheets: one per playbook/framework canon (= 7 in fixture).
    assert.ok(bundle.components.worksheets);
    const eligibleCount = canons.filter((c) =>
      ['playbook', 'framework', 'pattern'].includes(c.payload.type ?? ''),
    ).length;
    assert.equal(bundle.components.worksheets.length, eligibleCount);

    // Calculators: at least one cluster met threshold (the unit_economics
    // cluster sees CAC + LTV + ratio + payback).
    assert.ok(bundle.components.calculators);
    assert.ok(bundle.components.calculators.length >= 1);

    // Diagnostic
    assert.ok(bundle.components.diagnostic);
    assert.ok(bundle.components.diagnostic.questions.length >= 1);
    assert.ok(Object.keys(bundle.components.diagnostic.scoring).length >= 1);

    // Funnel: lead_magnet shape
    assert.equal(bundle.components.funnel.goal, 'lead_magnet');
    assert.ok(bundle.components.funnel.emailCapture);
    assert.equal(bundle.components.funnel.paywall, undefined);
    assert.equal(bundle.components.funnel.inlineCtas.length, 3);
    assert.ok(bundle.components.funnel.shareCardTemplates.length >= 1);
  });
});
