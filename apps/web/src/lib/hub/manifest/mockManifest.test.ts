// apps/web/src/lib/hub/manifest/mockManifest.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { mockManifest } from './mockManifest';
import { editorialAtlasManifestSchema, type PageSection } from './schema';

test('mock manifest: parses against schema', () => {
  const result = editorialAtlasManifestSchema.safeParse(mockManifest);
  if (!result.success) {
    console.error(result.error.issues);
  }
  assert.equal(result.success, true);
});

test('mock manifest: ≥14 pages with all 3 types covered', () => {
  assert.ok(mockManifest.pages.length >= 14, `expected ≥14 pages, got ${mockManifest.pages.length}`);
  const types = new Set(mockManifest.pages.map((p) => p.type));
  assert.ok(types.has('lesson'),    'missing lesson');
  assert.ok(types.has('framework'), 'missing framework');
  assert.ok(types.has('playbook'),  'missing playbook');
});

test('mock manifest: ≥8 topics, ≥20 sources', () => {
  assert.ok(mockManifest.topics.length  >= 8,  `expected ≥8 topics, got ${mockManifest.topics.length}`);
  assert.ok(mockManifest.sources.length >= 20, `expected ≥20 sources, got ${mockManifest.sources.length}`);
});

test('mock manifest: every section kind is exercised by at least one page', () => {
  const kinds = new Set<PageSection['kind']>();
  for (const page of mockManifest.pages) for (const s of page.sections) kinds.add(s.kind);

  const required: PageSection['kind'][] = [
    'overview', 'why_it_works', 'steps', 'common_mistakes', 'aha_moments',
    'principles', 'scenes', 'workflow', 'failure_points',
    'callout', 'paragraph', 'list', 'quote',
  ];

  for (const k of required) assert.ok(kinds.has(k), `no page exercises section kind '${k}'`);
});

test('mock manifest: every citation referenced by a section also appears in page.citations', () => {
  for (const page of mockManifest.pages) {
    const known = new Set(page.citations.map((c) => c.id));
    for (const section of page.sections) {
      for (const id of (section as { citationIds?: string[] }).citationIds ?? []) {
        assert.ok(known.has(id), `page ${page.slug} section ${section.kind} references unknown citation ${id}`);
      }
    }
  }
});

test('mock manifest: hubSlug and templateKey are consistent', () => {
  assert.equal(mockManifest.hubSlug,     'ali-abdaal');
  assert.equal(mockManifest.templateKey, 'editorial_atlas');
  assert.equal(mockManifest.schemaVersion, 'editorial_atlas_v1');
});

test('mock manifest: stats.pageCount matches pages.length', () => {
  assert.equal(mockManifest.stats.pageCount, mockManifest.pages.length);
});

test('mock manifest: structural integrity (topic slugs and relatedPageIds resolve)', () => {
  const topicSlugs = new Set(mockManifest.topics.map((t) => t.slug));
  const pageIds = new Set(mockManifest.pages.map((p) => p.id));
  const sourceIds = new Set(mockManifest.sources.map((s) => s.id));

  for (const page of mockManifest.pages) {
    for (const slug of page.topicSlugs) {
      assert.ok(topicSlugs.has(slug), `page ${page.slug} references unknown topic '${slug}'`);
    }
    for (const id of page.relatedPageIds) {
      assert.ok(pageIds.has(id), `page ${page.slug} relates to unknown page id '${id}'`);
    }
    for (const c of page.citations) {
      assert.ok(sourceIds.has(c.sourceVideoId), `page ${page.slug} citation ${c.id} references unknown source '${c.sourceVideoId}'`);
    }
  }

  for (const source of mockManifest.sources) {
    for (const slug of source.topicSlugs) {
      assert.ok(topicSlugs.has(slug), `source ${source.id} references unknown topic '${slug}'`);
    }
    for (const id of source.citedPageIds) {
      assert.ok(pageIds.has(id), `source ${source.id} citedPageIds references unknown page '${id}'`);
    }
  }
});
