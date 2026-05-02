/**
 * Composer router — picks which composers run for a given archetype.
 *
 * Stub for Task A.1; full router logic (with productGoal awareness) lands
 * in Task A.7.
 */

import type { ArchetypeSlug, ProductBundleComponentKey } from '../types';

export const COMPOSER_MATRIX: Record<ArchetypeSlug, Set<ProductBundleComponentKey>> = {
  'operator-coach': new Set<ProductBundleComponentKey>([
    'actionPlan',
    'worksheets',
    'calculators',
    'diagnostic',
    'funnel',
  ]),
  'science-explainer': new Set<ProductBundleComponentKey>([
    'reference',
    'debunking',
    'glossary',
    'diagnostic',
    'funnel',
  ]),
  'contemplative-thinker': new Set<ProductBundleComponentKey>(['cards', 'funnel']),
  'instructional-craft': new Set<ProductBundleComponentKey>([
    'lessonSequence',
    'worksheets',
    'diagnostic',
    'funnel',
  ]),
  _DEFAULT: new Set<ProductBundleComponentKey>(['funnel']),
};

export function routeComposers(archetype: ArchetypeSlug): Set<ProductBundleComponentKey> {
  return COMPOSER_MATRIX[archetype] ?? new Set<ProductBundleComponentKey>(['funnel']);
}
