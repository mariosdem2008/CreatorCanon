import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  buildCreatorManualIndex,
  getClaimsByIds,
  getNodesByIds,
  getPillarBySlug,
  getSegmentById,
  getSegmentsForSource,
  getSourceById,
  getThemeBySlug,
  getWorkshopStageBySlug,
} from './content';
import {
  getCreatorManualClaimsRoute,
  getCreatorManualGlossaryRoute,
  getCreatorManualHomeRoute,
  getCreatorManualLibraryRoute,
  getCreatorManualPillarRoute,
  getCreatorManualPillarsRoute,
  getCreatorManualSearchRoute,
  getCreatorManualSegmentRoute,
  getCreatorManualSegmentsRoute,
  getCreatorManualSourceRoute,
  getCreatorManualSourcesRoute,
  getCreatorManualThemeRoute,
  getCreatorManualThemesRoute,
  getCreatorManualWorkshopRoute,
  getCreatorManualWorkshopStageRoute,
} from './routes';
import { sampleCreatorManualManifest } from './sampleManifest';

const index = buildCreatorManualIndex(sampleCreatorManualManifest);

test('creator manual route helpers build scoped hub routes', () => {
  const hubSlug = 'creator-manual-preview';

  assert.equal(getCreatorManualHomeRoute(hubSlug), '/h/creator-manual-preview');
  assert.equal(getCreatorManualLibraryRoute(hubSlug), '/h/creator-manual-preview/library');
  assert.equal(getCreatorManualPillarsRoute(hubSlug), '/h/creator-manual-preview/pillars');
  assert.equal(getCreatorManualPillarRoute(hubSlug, 'positioning'), '/h/creator-manual-preview/pillars/positioning');
  assert.equal(getCreatorManualSourcesRoute(hubSlug), '/h/creator-manual-preview/sources');
  assert.equal(getCreatorManualSourceRoute(hubSlug, 'src-1'), '/h/creator-manual-preview/sources/src-1');
  assert.equal(getCreatorManualSegmentsRoute(hubSlug), '/h/creator-manual-preview/segments');
  assert.equal(getCreatorManualSegmentRoute(hubSlug, 'seg-1'), '/h/creator-manual-preview/segments/seg-1');
  assert.equal(getCreatorManualClaimsRoute(hubSlug), '/h/creator-manual-preview/claims');
  assert.equal(getCreatorManualGlossaryRoute(hubSlug), '/h/creator-manual-preview/glossary');
  assert.equal(getCreatorManualThemesRoute(hubSlug), '/h/creator-manual-preview/themes');
  assert.equal(getCreatorManualThemeRoute(hubSlug, 'clarity'), '/h/creator-manual-preview/themes/clarity');
  assert.equal(getCreatorManualWorkshopRoute(hubSlug), '/h/creator-manual-preview/workshop');
  assert.equal(getCreatorManualWorkshopStageRoute(hubSlug, 'map-audience'), '/h/creator-manual-preview/workshop/map-audience');
  assert.equal(getCreatorManualSearchRoute(hubSlug, 'proof loop'), '/h/creator-manual-preview/search?q=proof%20loop');
});

test('lookup helpers return records for ids and slugs', () => {
  assert.equal(getPillarBySlug(index, 'positioning')?.id, 'pillar-positioning');
  assert.equal(getThemeBySlug(index, 'clarity')?.id, 'theme-clarity');
  assert.equal(getSourceById(index, 'src-positioning-roundtable')?.title, 'Positioning Roundtable');
  assert.equal(getSegmentById(index, 'seg-audience-job')?.sourceId, 'src-positioning-roundtable');
  assert.equal(getWorkshopStageBySlug(index, 'map-audience')?.id, 'stage-map-audience');
});

test('lookup helpers degrade cleanly for missing records', () => {
  assert.equal(getPillarBySlug(index, 'missing'), null);
  assert.equal(getThemeBySlug(index, 'missing'), null);
  assert.equal(getSourceById(index, 'missing'), null);
  assert.equal(getSegmentById(index, 'missing'), null);
  assert.equal(getWorkshopStageBySlug(index, 'missing'), null);
});

test('related-record helpers filter missing ids without throwing', () => {
  assert.deepEqual(getNodesByIds(index, ['node_offer_lens', 'missing']).map((node) => node.id), ['node_offer_lens']);
  assert.deepEqual(getClaimsByIds(index, ['claim-specificity-builds-trust', 'missing']).map((claim) => claim.id), ['claim-specificity-builds-trust']);
  assert.deepEqual(getSegmentsForSource(index, 'src-positioning-roundtable').map((segment) => segment.id), [
    'seg-audience-job',
    'seg-simple-promise',
    'seg-proof-before-polish',
  ]);
});
