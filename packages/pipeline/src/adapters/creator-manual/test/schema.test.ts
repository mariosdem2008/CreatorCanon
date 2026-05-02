import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCreatorManualManifest } from '../schema';

const validManifest = () => ({
  schemaVersion: 'creator_manual_v1',
  template: { id: 'creator-manual', version: 1 },
  hubId: 'hub_preview',
  releaseId: 'release_preview',
  hubSlug: 'creator-preview',
  visibility: 'public',
  publishedAt: '2026-05-01T00:00:00.000Z',
  generatedAt: '2026-05-01T00:00:00.000Z',
  title: 'Creator Manual',
  tagline: 'Source-backed operating manual.',
  creator: {
    name: 'Creator',
    handle: '@creator',
    canonicalUrl: 'https://example.com/creator',
    tagline: 'Build better systems.',
    thesis: 'The archive teaches repeatable systems.',
    about: 'Creator teaches practical systems.',
    voiceSummary: 'Concise and direct.',
  },
  brand: {
    name: 'Creator Manual',
    tone: 'premium',
    tokens: {
      colors: {
        background: '#ffffff',
        foreground: '#111111',
        surface: '#f7f7f7',
        elevated: '#ffffff',
        border: '#dddddd',
        muted: '#666666',
        accent: '#111111',
        accentForeground: '#ffffff',
        warning: '#b45309',
        success: '#047857',
      },
      typography: {
        headingFamily: 'Inter',
        bodyFamily: 'Inter',
      },
      radius: '8px',
      shadow: 'none',
    },
    style: { mode: 'light' },
    labels: {},
  },
  navigation: {
    primary: [{ label: 'Library', routeKey: 'library' }],
    secondary: [{ label: 'Search', routeKey: 'search' }],
  },
  home: {
    eyebrow: 'Creator manual',
    headline: 'Build from evidence.',
    summary: 'A concise archive preview.',
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

test('parseCreatorManualManifest accepts a complete Creator Manual manifest', () => {
  const parsed = parseCreatorManualManifest(validManifest());
  assert.equal(parsed.schemaVersion, 'creator_manual_v1');
});

test('parseCreatorManualManifest rejects missing template id', () => {
  const manifest = validManifest() as any;
  delete manifest.template.id;

  assert.throws(
    () => parseCreatorManualManifest(manifest),
    /template\.id/,
  );
});

test('parseCreatorManualManifest rejects unsafe public urls', () => {
  const manifest = validManifest() as any;
  manifest.creator.canonicalUrl = 'javascript:alert(1)';

  assert.throws(
    () => parseCreatorManualManifest(manifest),
    /canonicalUrl/,
  );
});

test('parseCreatorManualManifest rejects unsafe public text', () => {
  const manifest = validManifest() as any;
  manifest.home.summary = 'This needs review before publish.';

  assert.throws(
    () => parseCreatorManualManifest(manifest),
    /Unsafe public text/,
  );
});
