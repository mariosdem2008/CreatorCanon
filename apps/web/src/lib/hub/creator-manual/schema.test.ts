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
    creator: {
      name: 'Creator',
      handle: '@creator',
      canonicalUrl: 'https://example.com/creator',
      tagline: 'A creator tagline.',
      thesis: 'A clear thesis for the creator manual.',
      about: 'A short public biography.',
      voiceSummary: 'Direct, concrete, and evidence-led.',
    },
    brand: {
      name: 'Brand',
      tone: 'practical',
      tokens: {
        colors: {
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
          typeMap: { framework: '#1d4ed8' },
        },
        typography: {
          headingFamily: 'Georgia, serif',
          bodyFamily: 'Arial, sans-serif',
        },
        radius: '8px',
        shadow: '6px 6px 0 #000000',
      },
      style: { mode: 'custom' },
      labels: {},
    },
    navigation: { primary: [], secondary: [] },
    home: {
      eyebrow: 'Manual',
      headline: 'Build clearly',
      summary: 'A short summary.',
      featuredNodeIds: [],
      featuredPillarIds: [],
    },
    stats: {
      nodeCount: 0,
      pillarCount: 0,
      sourceCount: 0,
      segmentCount: 0,
      claimCount: 0,
      glossaryCount: 0,
    },
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

test('creator manual schema accepts unknown future node tags', () => {
  const manifest = structuredClone(sampleCreatorManualManifest);
  manifest.nodes[0]!.type = 'future_framework';

  const result = creatorManualManifestSchema.safeParse(manifest);

  assert.equal(result.success, true);
});

test('creator manual schema rejects unsafe public asset URLs', () => {
  const manifest = structuredClone(sampleCreatorManualManifest);
  manifest.brand.assets = {
    heroImageUrl: 'javascript:alert(1)',
  };

  const result = creatorManualManifestSchema.safeParse(manifest);

  assert.equal(result.success, false);
});

test('creator manual schema rejects css-breaking absolute asset URLs', () => {
  const manifest = structuredClone(sampleCreatorManualManifest);
  manifest.brand.assets = {
    patternImageUrl: 'https://example.com/x"),url(https://attacker.test/pixel)/*',
  };

  const result = creatorManualManifestSchema.safeParse(manifest);

  assert.equal(result.success, false);
});

test('creator manual schema rejects unsafe css token values', () => {
  const cases: Array<{
    label: string;
    mutate: (manifest: typeof sampleCreatorManualManifest) => void;
  }> = [
    {
      label: 'color declaration injection',
      mutate: (manifest) => {
        manifest.brand.tokens.colors.background =
          'red; background-image:url(https://attacker.test/x)';
      },
    },
    {
      label: 'type map url token',
      mutate: (manifest) => {
        manifest.brand.tokens.colors.typeMap = {
          lesson: 'url(https://attacker.test/x)',
        };
      },
    },
    {
      label: 'radius declaration injection',
      mutate: (manifest) => {
        manifest.brand.tokens.radius = '8px; color:red';
      },
    },
    {
      label: 'shadow url token',
      mutate: (manifest) => {
        manifest.brand.tokens.shadow = '0 0 0 url(https://attacker.test/x)';
      },
    },
    {
      label: 'font declaration injection',
      mutate: (manifest) => {
        manifest.brand.tokens.typography.headingFamily = 'Inter; color:red';
      },
    },
  ];

  for (const { label, mutate } of cases) {
    const manifest = structuredClone(sampleCreatorManualManifest);
    mutate(manifest);

    const result = creatorManualManifestSchema.safeParse(manifest);

    assert.equal(result.success, false, label);
  }
});

test('creator manual schema rejects public UUID and internal review language leaks', () => {
  const manifest = structuredClone(sampleCreatorManualManifest);
  manifest.home.summary = 'Needs review before publishing 123e4567-e89b-12d3-a456-426614174000.';

  const result = creatorManualManifestSchema.safeParse(manifest);

  assert.equal(result.success, false);
});

test('creator manual schema rejects invalid schema version', () => {
  const result = creatorManualManifestSchema.safeParse({
    ...sampleCreatorManualManifest,
    schemaVersion: 'wrong_version',
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
  const requiredTypes = [
    'node',
    'pillar',
    'source',
    'segment',
    'claim',
    'glossary',
    'theme',
    'workshop',
  ] as const;
  for (const type of requiredTypes) {
    assert.equal(searchTypes.has(type), true);
  }
});
