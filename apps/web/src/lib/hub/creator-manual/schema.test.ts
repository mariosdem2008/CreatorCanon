import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { sampleCreatorManualManifest } from './sampleManifest';
import { creatorManualManifestSchema } from './schema';

test('creator manual schema parses a minimal valid manifest', () => {
  const result = creatorManualManifestSchema.safeParse({
    schemaVersion: 'creator_manual_v1',
    template: { id: 'creator-manual', version: 1 },
    hubId: 'h',
    releaseId: 'r',
    hubSlug: 'creator-manual',
    visibility: 'unlisted',
    publishedAt: null,
    generatedAt: '2026-05-01T00:00:00.000Z',
    title: 'Manual',
    tagline: 'A useful field manual.',
    creator: { name: 'Creator', handle: '@creator', bio: 'Bio', avatarUrl: '' },
    brand: {
      name: 'Brand',
      tone: 'practical',
      tokens: {
        background: '#ffffff',
        foreground: '#000000',
        surface: '#f7f7f7',
        elevated: '#ffffff',
        border: '#dddddd',
        muted: '#666666',
        accent: '#111111',
        accentForeground: '#ffffff',
        warning: '#f97316',
        success: '#16a34a',
        radius: '8px',
        headingFamily: 'Georgia, serif',
        bodyFamily: 'Arial, sans-serif',
      },
      labels: {},
    },
    navigation: { primary: [], secondary: [] },
    home: { eyebrow: 'Manual', headline: 'Build clearly', summary: 'A short summary.', featuredNodeIds: [], featuredPillarIds: [] },
    stats: { nodeCount: 0, pillarCount: 0, sourceCount: 0, segmentCount: 0, claimCount: 0, glossaryCount: 0 },
    nodes: [],
    pillars: [],
    sources: [],
    segments: [],
    claims: [],
    glossary: [],
    themes: [],
    workshop: [],
    search: [],
  });

  assert.equal(result.success, true);
});

test('creator manual schema rejects invalid schema version', () => {
  const result = creatorManualManifestSchema.safeParse({
    ...sampleCreatorManualManifest,
    schemaVersion: 'editorial_atlas_v1',
  });

  assert.equal(result.success, false);
});

test('sample creator manual manifest parses and includes every preview record family', () => {
  const result = creatorManualManifestSchema.safeParse(sampleCreatorManualManifest);

  assert.equal(result.success, true);
  assert.equal(sampleCreatorManualManifest.nodes.length >= 6, true);
  assert.equal(sampleCreatorManualManifest.pillars.length >= 3, true);
  assert.equal(sampleCreatorManualManifest.sources.length >= 3, true);
  assert.equal(sampleCreatorManualManifest.segments.length >= 8, true);
  assert.equal(sampleCreatorManualManifest.claims.length >= 6, true);
  assert.equal(sampleCreatorManualManifest.glossary.length >= 8, true);
  assert.equal(sampleCreatorManualManifest.themes.length >= 4, true);
  assert.equal(sampleCreatorManualManifest.workshop.length >= 4, true);

  const searchTypes = new Set(sampleCreatorManualManifest.search.map((doc) => doc.type));
  const requiredTypes = ['node', 'pillar', 'source', 'segment', 'claim', 'glossary', 'theme', 'workshop'] as const;
  for (const type of requiredTypes) {
    assert.equal(searchTypes.has(type), true);
  }
});
