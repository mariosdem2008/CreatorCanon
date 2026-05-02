/**
 * Tests for composer router.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { routeComposers, COMPOSER_MATRIX } from './router';

describe('routeComposers', () => {
  test('operator-coach gets the full operator-coach component set', () => {
    const set = routeComposers('operator-coach');
    assert.ok(set.has('actionPlan'));
    assert.ok(set.has('worksheets'));
    assert.ok(set.has('calculators'));
    assert.ok(set.has('diagnostic'));
    assert.ok(set.has('funnel'));
  });

  test('contemplative-thinker gets cards + themes + decisionFrames + funnel', () => {
    const set = routeComposers('contemplative-thinker');
    assert.ok(set.has('cards'));
    assert.ok(set.has('themes'));
    assert.ok(set.has('decisionFrames'));
    assert.ok(set.has('funnel'));
    assert.ok(!set.has('actionPlan'));
    assert.ok(!set.has('worksheets'));
  });

  test('_DEFAULT falls back to funnel-only', () => {
    const set = routeComposers('_DEFAULT');
    assert.equal(set.size, 1);
    assert.ok(set.has('funnel'));
  });

  test('matrix is exhaustive over known archetypes', () => {
    assert.ok(COMPOSER_MATRIX['operator-coach']);
    assert.ok(COMPOSER_MATRIX['science-explainer']);
    assert.ok(COMPOSER_MATRIX['instructional-craft']);
    assert.ok(COMPOSER_MATRIX['contemplative-thinker']);
    assert.ok(COMPOSER_MATRIX['_DEFAULT']);
  });
});
