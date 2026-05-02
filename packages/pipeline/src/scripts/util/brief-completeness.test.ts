import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBriefCompletenessPatch,
  buildBriefCompletenessPrompt,
  ensureBriefCompleteness,
  findBriefCompletenessGaps,
} from './brief-completeness';
import type { PageBriefShell } from './brief-body-writer';

const baseBrief: PageBriefShell = {
  schemaVersion: 'v2',
  pageId: 'pb_offer',
  pageTitle: 'Grand Slam Offer',
  hook: 'I make the offer impossible to ignore.',
  lede: 'A page about offer design.',
  body: '',
  cta: { primary: '', secondary: '' },
  _internal_audience_question: 'How do I make an offer convert?',
  _internal_persona: {
    name: 'Operator',
    context: 'Trying to package a service.',
    objection: 'They think the offer is already clear.',
    proofThatHits: 'Specific economics.',
  },
  _internal_journey_phase: 2,
  _internal_seo: {
    primaryKeyword: '',
    intent: 'commercial',
    titleTemplate: '',
    metaDescription: '',
  },
  _internal_page_worthiness_score: 90,
  _index_slug: 'grand-slam-offer',
  _index_page_type: 'framework',
  _index_primary_canon_node_ids: ['cn_offer'],
  _index_supporting_canon_node_ids: [],
  _index_outline: [],
  _index_cluster_role: { tier: '' as 'pillar', parent_topic: null, sibling_slugs: [] },
  _index_voice_fingerprint: {
    profanityAllowed: true,
    tonePreset: 'blunt-tactical',
    preserveTerms: ['Grand Slam Offer'],
  },
  _index_position: 0,
};

describe('findBriefCompletenessGaps', () => {
  test('detects missing tier, primary keyword, and primary CTA', () => {
    assert.deepEqual(findBriefCompletenessGaps(baseBrief), ['tier', 'primaryKeyword', 'cta.primary']);
  });
});

describe('applyBriefCompletenessPatch', () => {
  test('fills only missing SEO, cluster-role, and CTA fields', () => {
    const patched = applyBriefCompletenessPatch(baseBrief, {
      tier: 'pillar',
      primaryKeyword: 'grand slam offer',
      ctaPrimary: 'Build my Grand Slam Offer next',
    });

    assert.equal(patched._index_cluster_role.tier, 'pillar');
    assert.equal(patched._internal_seo.primaryKeyword, 'grand slam offer');
    assert.equal(patched.cta.primary, 'Build my Grand Slam Offer next');
    assert.equal(patched.cta.secondary, '');
  });
});

describe('buildBriefCompletenessPrompt', () => {
  test('asks for the missing fields using canon shell context', () => {
    const prompt = buildBriefCompletenessPrompt({
      brief: baseBrief,
      gaps: ['tier', 'primaryKeyword', 'cta.primary'],
      canonShells: [{ id: 'cn_offer', title: 'Offer Math', type: 'framework', internal_summary: 'The economics of the offer.' }],
    });

    assert.match(prompt, /tier/);
    assert.match(prompt, /primaryKeyword/);
    assert.match(prompt, /ctaPrimary/);
    assert.match(prompt, /Offer Math/);
  });
});

describe('ensureBriefCompleteness', () => {
  test('uses an injected populator when required fields are missing', async () => {
    const completed = await ensureBriefCompleteness(baseBrief, {
      canonShells: [],
      populator: async () => ({
        tier: 'spoke',
        primaryKeyword: 'offer conversion',
        ctaPrimary: 'Use my offer conversion checklist',
      }),
    });

    assert.equal(completed._index_cluster_role.tier, 'spoke');
    assert.equal(completed._internal_seo.primaryKeyword, 'offer conversion');
    assert.equal(completed.cta.primary, 'Use my offer conversion checklist');
  });
});
