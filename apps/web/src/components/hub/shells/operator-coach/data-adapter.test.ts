/**
 * Tests for the operator-coach data adapter.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { ProductBundle } from '@creatorcanon/synthesis';
import { adaptBundleForOperatorCoach } from './data-adapter';

function makeBundle(overrides: Partial<ProductBundle> = {}): ProductBundle {
  return {
    archetype: 'operator-coach',
    voiceMode: 'first_person',
    productGoal: 'lead_magnet',
    creatorConfig: {
      brand: { primaryColor: '#000' },
      ctas: { primary: { label: 'Start', href: '/start' } },
    },
    components: {
      actionPlan: {
        phases: [
          {
            id: 'pre_revenue',
            name: 'Pre-revenue',
            position: 0,
            steps: [
              {
                id: 's1',
                title: 'Pick',
                description: 'Pick a niche.',
                durationLabel: 'this week',
                successCriterion: 'Niche named.',
                sourceCanonId: 'c1',
              },
            ],
          },
        ],
        intro: 'Begin here. Three steps to your first deal.',
        outroCta: 'Pick the first phase and start it.',
      },
      worksheets: [],
      calculators: [],
      funnel: {
        goal: 'lead_magnet',
        emailCapture: { label: 'Get it', submitText: 'Send', thankyouText: 'Done' },
        shareCardTemplates: [],
        inlineCtas: [],
      },
    },
    generatedAt: new Date().toISOString(),
    schemaVersion: 'product_bundle_v1',
    ...overrides,
  };
}

describe('adaptBundleForOperatorCoach', () => {
  test('produces shell props with all pages populated when bundle is complete', () => {
    const props = adaptBundleForOperatorCoach(makeBundle());
    assert.equal(props.archetype, 'operator-coach');
    assert.equal(props.brand.primaryColor, '#000');
    assert.deepEqual(props.primaryCta, { label: 'Start', href: '/start' });
    assert.ok(props.pages.home.heroHeadline.length > 0);
    assert.ok(props.pages.home.heroSubcopy.length > 0);
    assert.ok(props.pages.actionPlan);
    assert.equal(props.pages.actionPlan.phases.length, 1);
    assert.equal(props.pages.library.enabled, false);
  });

  test('handles missing actionPlan with stable defaults', () => {
    const bundle = makeBundle();
    delete bundle.components.actionPlan;
    const props = adaptBundleForOperatorCoach(bundle);
    assert.equal(props.pages.actionPlan, null);
    assert.ok(props.pages.home.heroHeadline.length > 0);
    assert.ok(props.pages.home.heroSubcopy.length > 0);
  });

  test('handles missing primary CTA', () => {
    const bundle = makeBundle({
      creatorConfig: {
        brand: { primaryColor: '#000' },
        ctas: {},
      },
    });
    const props = adaptBundleForOperatorCoach(bundle);
    assert.equal(props.primaryCta, null);
  });

  test('throws when called with non-operator-coach archetype', () => {
    const bundle = makeBundle({ archetype: 'science-explainer' });
    assert.throws(() => adaptBundleForOperatorCoach(bundle));
  });
});
