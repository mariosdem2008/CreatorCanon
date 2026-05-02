/**
 * Tests for the science-explainer data adapter.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { ProductBundle } from '@creatorcanon/synthesis';
import { adaptBundleForScienceExplainer } from './data-adapter';

function makeBundle(overrides: Partial<ProductBundle> = {}): ProductBundle {
  return {
    archetype: 'science-explainer',
    voiceMode: 'third_person_editorial',
    productGoal: 'public_reference',
    creatorConfig: {
      brand: { primaryColor: '#0a0a0a' },
      ctas: { primary: { label: 'Subscribe', href: '/subscribe' } },
    },
    components: {
      reference: {
        cards: [
          {
            id: 'card_c1',
            claim: 'Linoleic acid is well-tolerated at typical intake.',
            verdict: 'supported',
            mechanismExplanation: 'No biomarker shifts in RCTs.',
            topic: 'nutrition',
            studyEvidenceCanonIds: ['c1'],
            caveats: [],
          },
          {
            id: 'card_c2',
            claim: 'Magnesium glycinate aids sleep onset.',
            verdict: 'partially_supported',
            mechanismExplanation: 'Mixed RCT evidence, moderate effect sizes.',
            topic: 'sleep',
            studyEvidenceCanonIds: ['c2'],
            caveats: ['Effect varies by baseline magnesium status.'],
          },
        ],
        topicIndex: {
          nutrition: ['card_c1'],
          sleep: ['card_c2'],
        },
      },
      debunking: {
        items: [
          {
            id: 'myth_c1',
            myth: 'Seed oils cause systemic inflammation.',
            reality:
              'No biomarker shifts in RCTs at typical intake; the inflammation narrative comes from cell-culture extrapolation.',
            primaryEvidenceCanonIds: ['c1'],
          },
        ],
      },
      glossary: {
        entries: [
          {
            id: 'term_linoleic-acid',
            term: 'Linoleic acid',
            definition: 'A polyunsaturated omega-6 fatty acid in seed oils and many whole foods.',
            appearsInCanonIds: ['c1'],
          },
        ],
      },
      funnel: {
        goal: 'public_reference',
        shareCardTemplates: [],
        inlineCtas: [],
      },
    },
    generatedAt: new Date().toISOString(),
    schemaVersion: 'product_bundle_v1',
    ...overrides,
  };
}

describe('adaptBundleForScienceExplainer', () => {
  test('produces shell props with all pages populated', () => {
    const props = adaptBundleForScienceExplainer(makeBundle());
    assert.equal(props.archetype, 'science-explainer');
    assert.equal(props.brand.primaryColor, '#0a0a0a');
    assert.deepEqual(props.primaryCta, { label: 'Subscribe', href: '/subscribe' });
    assert.equal(props.pages.home.cards.length, 2);
    assert.equal(props.pages.claim.cards.length, 2);
    assert.equal(props.pages.debunking.items.length, 1);
    assert.equal(props.pages.glossary.entries.length, 1);
    assert.deepEqual(Object.keys(props.pages.topic.topicIndex).sort(), [
      'nutrition',
      'sleep',
    ]);
  });

  test('builds id-indexed lookup tables', () => {
    const props = adaptBundleForScienceExplainer(makeBundle());
    assert.ok(props.pages.claim.cardById.card_c1);
    assert.ok(props.pages.debunking.itemById.myth_c1);
    assert.ok(props.pages.glossary.entryById['term_linoleic-acid']);
  });

  test('handles missing reference component with empty defaults', () => {
    const bundle = makeBundle();
    delete bundle.components.reference;
    const props = adaptBundleForScienceExplainer(bundle);
    assert.deepEqual(props.pages.home.cards, []);
    assert.deepEqual(props.pages.home.topicIndex, {});
    assert.deepEqual(props.pages.claim.cards, []);
    assert.ok(props.pages.home.heroHeadline.length > 0);
    assert.ok(props.pages.home.heroSubcopy.length > 0);
  });

  test('handles missing primary CTA', () => {
    const bundle = makeBundle({
      creatorConfig: { brand: { primaryColor: '#000' }, ctas: {} },
    });
    const props = adaptBundleForScienceExplainer(bundle);
    assert.equal(props.primaryCta, null);
  });

  test('throws when called with non-science-explainer archetype', () => {
    const bundle = makeBundle({ archetype: 'operator-coach' });
    assert.throws(() => adaptBundleForScienceExplainer(bundle));
  });
});
