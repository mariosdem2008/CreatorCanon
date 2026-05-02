/**
 * Cohort smoke deferred per Phase H directive — Mario triggers live runs on
 * Walker + Norton. This fixture mimics the Walker-style sleep-science and
 * Norton-style nutrition-science substrates so the end-to-end runSynthesis
 * pipeline is exercised with realistic shape + volumes (~25 canon nodes per
 * archetype-style mix: claim / evidence_review / definition / debunking /
 * aphorism) without making any real Codex calls.
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
      // Reference composer
      if (prompt.includes('evidence card')) {
        return JSON.stringify({
          claim: 'A claim summary derived from the canon body.',
          mechanismExplanation:
            'A 1-2 sentence mechanism explanation grounded in the cited evidence.',
          caveats: ['One short caveat about generalisability.'],
          counterClaim: 'A common myth this card pushes back on.',
        });
      }
      // Debunking forge
      if (prompt.includes('debunking item')) {
        return JSON.stringify({
          myth: 'A common myth in plain language.',
          reality:
            'Counter-narrative grounded in the canon body. Two to four sentences. Cites mechanism and effect-size context.',
        });
      }
      // Glossary builder
      if (prompt.includes('glossary definition')) {
        return JSON.stringify({
          definition: 'A 1-2 sentence definition aligned to the creator usage.',
        });
      }
      // Diagnostic intro
      if (prompt.includes('intro for an operator-coach diagnostic')) {
        return JSON.stringify({ text: 'Three quick questions.' });
      }
      // Diagnostic questions
      if (prompt.includes('multi-choice diagnostic questions')) {
        return JSON.stringify({
          questions: [
            {
              id: 'q1',
              text: 'What are you trying to figure out?',
              options: [
                { label: 'Sleep', value: 'sleep', weight: 1 },
                { label: 'Nutrition', value: 'nutrition', weight: 1 },
              ],
            },
          ],
        });
      }
      // Funnel: lead capture
      if (prompt.includes('lead capture')) {
        return JSON.stringify({
          label: 'Get the weekly digest',
          submitText: 'Subscribe',
          thankyouText: 'Check your inbox.',
        });
      }
      // Funnel: paywall
      if (prompt.includes('paywall')) {
        return JSON.stringify({
          tagline: 'Go deeper',
          bullets: ['Full archive', 'Sources'],
          ctaText: 'Subscribe',
        });
      }
      // Funnel: login
      if (prompt.includes('login')) {
        return JSON.stringify({ headline: 'Members', ctaText: 'Sign in' });
      }
      // Funnel: inline CTAs
      if (prompt.includes('inline CTAs')) {
        return JSON.stringify({
          ctas: [
            { pageDepth: 'shallow', text: 'Browse claims', href: '/claims' },
            { pageDepth: 'mid', text: 'See myths', href: '/debunking' },
            { pageDepth: 'deep', text: 'Subscribe', href: '/subscribe' },
          ],
        });
      }
      // Share card
      if (prompt.includes('share-card')) {
        return JSON.stringify({
          title: 'A pithy claim summary',
          quote: 'A pull-quote from the canon.',
        });
      }
      return JSON.stringify({});
    },
  };
}

/** A Walker-style sleep-science substrate. */
function fabricateWalkerSubstrate(): {
  channelProfile: ChannelProfileRef;
  canons: CanonRef[];
} {
  const channelProfile: ChannelProfileRef = {
    archetype: 'science-explainer',
    voiceMode: 'third_person_editorial',
    creatorName: 'Walker (sim)',
    niche: 'sleep science',
    _index_audience_jobs: [
      { id: 'sleep-quality', label: 'Improve sleep quality' },
      { id: 'circadian', label: 'Align circadian rhythm' },
    ],
  };

  const canons: CanonRef[] = [
    {
      id: 'w1',
      payload: {
        type: 'claim',
        title: 'Adults need 7-9 hours',
        body: 'The data shows adults need 7-9 hours of sleep for memory consolidation. RCTs and meta-analyses confirm.',
        _index_verification_status: 'confirmed',
        _index_topic: 'Sleep duration',
      },
    },
    {
      id: 'w2',
      payload: {
        type: 'evidence_review',
        title: 'Sleep tracker accuracy',
        body: 'Actually, the data shows consumer sleep trackers correlate weakly with PSG. The myth is that an 80 score means good sleep.',
        _index_verification_status: 'partially_confirmed',
        _index_topic: 'Sleep tracking',
      },
    },
    {
      id: 'w3',
      payload: {
        type: 'claim',
        title: 'Caffeine half-life',
        body: 'Caffeine has a 5-6 hour half-life. Afternoon coffee impacts sleep onset. Adenosine Receptors are blocked.',
        _index_verification_status: 'confirmed',
        _index_topic: 'Caffeine',
      },
    },
    {
      id: 'w4',
      payload: {
        type: 'definition',
        title: 'Slow Wave Sleep',
        body: 'Slow Wave Sleep is the deepest non-REM stage. Slow Wave Sleep dominates the first half of the night. Slow Wave Sleep is when memory consolidates.',
        _index_topic: 'Sleep architecture',
      },
    },
    {
      id: 'w5',
      payload: {
        type: 'debunking',
        title: 'Eight hours myth',
        body: 'The myth is that everyone needs exactly 8 hours. Actually, the data shows 7-9 is the population range; individuals vary.',
        _index_verification_status: 'contradicted',
        _index_topic: 'Sleep duration',
      },
    },
    // More claim canons for volume
    ...Array.from({ length: 15 }, (_, i) => ({
      id: `wclaim${i}`,
      payload: {
        type: 'claim',
        title: `Sleep claim ${i}`,
        body: `Sleep claim ${i}. The data shows X. Adenosine Receptors involved. Slow Wave Sleep relevant.`,
        _index_verification_status: i % 3 === 0 ? 'confirmed' : 'partially_confirmed',
        _index_topic: i % 2 === 0 ? 'Sleep duration' : 'Caffeine',
      },
    })),
    // Some debunking volume
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `wmyth${i}`,
      payload: {
        type: 'debunking',
        title: `Sleep myth ${i}`,
        body: `The myth is that X${i}. Actually, the data shows Y${i}.`,
      },
    })),
    // Aphorisms (for share cards)
    {
      id: 'wa1',
      payload: { type: 'aphorism', title: 'Sleep is non-negotiable', body: 'Sleep is non-negotiable.' },
    },
  ];

  return { channelProfile, canons };
}

/** A Norton-style nutrition-science substrate. */
function fabricateNortonSubstrate(): {
  channelProfile: ChannelProfileRef;
  canons: CanonRef[];
} {
  const channelProfile: ChannelProfileRef = {
    archetype: 'science-explainer',
    voiceMode: 'third_person_editorial',
    creatorName: 'Norton (sim)',
    niche: 'nutrition science',
    _index_audience_jobs: [
      { id: 'fat-loss', label: 'Lose body fat' },
      { id: 'protein-target', label: 'Hit protein target' },
    ],
  };

  const canons: CanonRef[] = [
    {
      id: 'n1',
      payload: {
        type: 'claim',
        title: 'Linoleic acid is well-tolerated',
        body: 'The data shows Linoleic Acid is well-tolerated at typical intake. RCTs show no biomarker shifts. The myth is that seed oils cause inflammation.',
        _index_verification_status: 'confirmed',
        _index_topic: 'Nutrition / Fats',
      },
    },
    {
      id: 'n2',
      payload: {
        type: 'evidence_review',
        title: 'Protein intake',
        body: 'Meta-analyses show 1.6 g/kg protein supports lean mass when training. Higher intakes show diminishing returns.',
        _index_verification_status: 'confirmed',
        _index_topic: 'Protein',
      },
    },
    {
      id: 'n3',
      payload: {
        type: 'debunking',
        title: 'Seed oils cause inflammation',
        body: 'The myth is that seed oils cause inflammation. Actually, the data shows Linoleic Acid is well-tolerated. No biomarker shifts in RCTs.',
        _index_verification_status: 'contradicted',
        _index_topic: 'Nutrition / Fats',
      },
    },
    {
      id: 'n4',
      payload: {
        type: 'definition',
        title: 'Linoleic Acid',
        body: 'Linoleic Acid is a polyunsaturated omega-6 fatty acid. Linoleic Acid is in seed oils. Linoleic Acid is in many whole foods.',
        _index_topic: 'Fatty acids',
      },
    },
    {
      id: 'n5',
      payload: {
        type: 'claim',
        title: 'Calorie balance is necessary',
        body: 'Energy balance drives fat loss. Calories matter. The data shows this consistently.',
        _index_verification_status: 'confirmed',
        _index_topic: 'Energy balance',
      },
    },
    // Volume
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `nclaim${i}`,
      payload: {
        type: 'claim',
        title: `Nutrition claim ${i}`,
        body: `Nutrition claim ${i}. The data shows X. Linoleic Acid relevant. Energy Balance applies.`,
        _index_verification_status: i % 4 === 0 ? 'confirmed' : 'mixed',
        _index_topic: i % 2 === 0 ? 'Nutrition / Fats' : 'Protein',
      },
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `nmyth${i}`,
      payload: {
        type: 'debunking',
        title: `Nutrition myth ${i}`,
        body: `The myth is that X${i}. Actually, the data shows Y${i}.`,
      },
    })),
    {
      id: 'na1',
      payload: { type: 'aphorism', title: 'Calories are stubborn', body: 'Calories are stubborn.' },
    },
  ];

  return { channelProfile, canons };
}

describe('Phase H cohort smoke (fixture)', () => {
  test('Walker-style substrate produces a complete science-explainer bundle', async () => {
    const { channelProfile, canons } = fabricateWalkerSubstrate();
    const creatorConfig: CreatorConfig = {
      brand: { primaryColor: '#0a0a0a' },
      ctas: { primary: { label: 'Subscribe', href: '/subscribe' } },
    };

    const bundle = await runSynthesis({
      runId: 'walker-fixture',
      productGoal: 'public_reference',
      creatorConfig,
      channelProfile,
      canons,
      codex: makeStubCodex(),
    });

    // Envelope
    assert.equal(bundle.archetype, 'science-explainer');
    assert.equal(bundle.voiceMode, 'third_person_editorial');
    assert.equal(bundle.schemaVersion, 'product_bundle_v1');

    // Reference: every claim/evidence_review/definition canon → an EvidenceCard.
    assert.ok(bundle.components.reference);
    const eligible = canons.filter((c) =>
      ['claim', 'evidence_review', 'definition'].includes(c.payload.type ?? ''),
    );
    assert.equal(bundle.components.reference.cards.length, eligible.length);
    assert.ok(Object.keys(bundle.components.reference.topicIndex).length >= 1);
    // At least one verdict variant other than "mixed" appears.
    const verdicts = new Set(
      bundle.components.reference.cards.map((c) => c.verdict),
    );
    assert.ok(verdicts.has('supported') || verdicts.has('partially_supported'));

    // Debunking: at least the explicit debunking canons + body-cue matches.
    assert.ok(bundle.components.debunking);
    assert.ok(bundle.components.debunking.items.length >= 3);

    // Glossary: at least the repeated mechanism terms (Slow Wave Sleep,
    // Adenosine Receptors) surface.
    assert.ok(bundle.components.glossary);
    const glossaryTerms = bundle.components.glossary.entries.map((e) =>
      e.term.toLowerCase(),
    );
    assert.ok(
      glossaryTerms.some((t) => t.includes('slow wave sleep')),
      `expected "Slow Wave Sleep" in glossary; got ${glossaryTerms.join(', ')}`,
    );

    // Diagnostic
    assert.ok(bundle.components.diagnostic);
    assert.ok(bundle.components.diagnostic.questions.length >= 1);

    // Funnel: public_reference -> no emailCapture/paywall/login.
    assert.equal(bundle.components.funnel.goal, 'public_reference');
    assert.equal(bundle.components.funnel.emailCapture, undefined);
    assert.equal(bundle.components.funnel.paywall, undefined);
    assert.equal(bundle.components.funnel.login, undefined);
    assert.equal(bundle.components.funnel.inlineCtas.length, 3);
  });

  test('Norton-style substrate produces a complete science-explainer bundle', async () => {
    const { channelProfile, canons } = fabricateNortonSubstrate();
    const creatorConfig: CreatorConfig = {
      brand: { primaryColor: '#1a1a1a' },
      ctas: { primary: { label: 'Subscribe', href: '/subscribe' } },
    };

    const bundle = await runSynthesis({
      runId: 'norton-fixture',
      productGoal: 'lead_magnet',
      creatorConfig,
      channelProfile,
      canons,
      codex: makeStubCodex(),
    });

    assert.equal(bundle.archetype, 'science-explainer');

    // Reference cards
    assert.ok(bundle.components.reference);
    assert.ok(bundle.components.reference.cards.length >= 5);

    // Debunking surfaces seed-oil myth via body cues.
    assert.ok(bundle.components.debunking);
    assert.ok(bundle.components.debunking.items.length >= 1);

    // Glossary surfaces "Linoleic Acid" via repeated capitalised mention.
    assert.ok(bundle.components.glossary);
    const glossaryTerms = bundle.components.glossary.entries.map((e) =>
      e.term.toLowerCase(),
    );
    assert.ok(
      glossaryTerms.some((t) => t.includes('linoleic acid')),
      `expected "Linoleic Acid" in glossary; got ${glossaryTerms.join(', ')}`,
    );

    // Funnel: lead_magnet -> emailCapture present.
    assert.ok(bundle.components.funnel.emailCapture);
  });
});
