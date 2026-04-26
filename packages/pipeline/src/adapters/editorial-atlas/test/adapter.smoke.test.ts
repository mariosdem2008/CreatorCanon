import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../../env-files';
import { adaptArchiveToEditorialAtlas } from '..';
import { runMergeStage } from '../../../stages/merge';
import { _resetRegistryForTests, registerAllTools } from '../../../agents/tools/registry';
import {
  proposeLessonTool,
  proposeFrameworkTool,
  proposeQuoteTool,
  proposeRelationTool,
} from '../../../agents/tools/propose';
import {
  seedTestRun,
  teardownTestRun,
  makeCtx,
  type SeedResult,
} from '../../../../test-helpers/fixtures';
// apps/web has no "type":"module" so tsx wraps its exports under `default`.
// We import the default export and extract the schema from it.
import schemaModule from '../../../../../../apps/web/src/lib/hub/manifest/schema';
const { editorialAtlasManifestSchema } = (schemaModule as any).default
  ? ((schemaModule as any).default as typeof schemaModule)
  : schemaModule;
import { eq, getDb } from '@creatorcanon/db';
import { hub, release } from '@creatorcanon/db/schema';

describe('editorial-atlas adapter (smoke)', () => {
  let seed: SeedResult;
  let hubId: string;
  let releaseId: string;

  before(async () => {
    loadDefaultEnvFiles();
    _resetRegistryForTests();
    registerAllTools();

    seed = await seedTestRun({
      videos: [
        { id: 'vid_a_v1', title: 'X', durationSec: 600 },
        { id: 'vid_a_v2', title: 'Y', durationSec: 600 },
      ],
      segments: [
        { id: 'seg_a_a', videoId: 'vid_a_v1', startMs: 0, endMs: 30_000, text: 'A' },
        { id: 'seg_a_b', videoId: 'vid_a_v1', startMs: 30_000, endMs: 60_000, text: 'B' },
        { id: 'seg_a_c', videoId: 'vid_a_v2', startMs: 0, endMs: 30_000, text: 'C' },
      ],
    });

    // Seed: 1 lesson + 1 framework + 1 attached quote + 1 orphan quote.
    const lesson = await proposeLessonTool.handler(
      {
        title: 'Treat writing as thinking',
        summary: 'A short summary describing the idea.',
        idea: 'When you write you discover what you think; the page is a partner in reasoning.',
        evidence: [{ segmentId: 'seg_a_a' }, { segmentId: 'seg_a_c' }],
      },
      makeCtx(seed, 'lesson_extractor', 'gpt-5.5'),
    );
    if (!lesson.ok) throw new Error('seed lesson failed');

    const fw = await proposeFrameworkTool.handler(
      {
        title: 'Eisenhower Matrix',
        summary: 'Quadrants for prioritization by urgency and importance.',
        principles: [{ title: 'Urgency', body: 'Distinguish from importance.' }],
        evidence: [{ segmentId: 'seg_a_b' }, { segmentId: 'seg_a_c' }],
      },
      makeCtx(seed, 'framework_extractor', 'gpt-5.5'),
    );
    if (!fw.ok) throw new Error('seed framework failed');

    const attached = await proposeQuoteTool.handler(
      {
        text: 'Writing is the act of thinking on paper.',
        evidence: { segmentId: 'seg_a_a' },
      },
      makeCtx(seed, 'quote_finder', 'gpt-5.5'),
    );
    if (!attached.ok) throw new Error('seed attached quote failed');

    await proposeRelationTool.handler(
      {
        fromFindingId: attached.findingId,
        toFindingId: lesson.findingId,
        type: 'supports',
        evidence: [{ segmentId: 'seg_a_a' }],
      },
      makeCtx(seed, 'quote_finder', 'gpt-5.5'),
    );

    await proposeQuoteTool.handler(
      {
        text: 'A pithy quote nobody attached to anything.',
        evidence: { segmentId: 'seg_a_b' },
      },
      makeCtx(seed, 'quote_finder', 'gpt-5.5'),
    );

    // Run merge to create pages.
    await runMergeStage({
      runId: seed.runId,
      workspaceId: seed.workspaceId,
      polishProvider: null,
    });

    // Seed hub + release.
    hubId = `hub_${seed.runId.slice(-8)}`;
    releaseId = `rel_${seed.runId.slice(-8)}`;
    const db = getDb();

    await db.insert(hub).values({
      id: hubId,
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      subdomain: `test-${seed.runId.slice(-8)}`,
      templateKey: 'editorial_atlas',
      accessMode: 'public',
      metadata: {} as any,
    });

    await db.insert(release).values({
      id: releaseId,
      workspaceId: seed.workspaceId,
      hubId,
      runId: seed.runId,
      releaseNumber: 1,
      status: 'building',
    });
  });

  after(async () => {
    const db = getDb();
    await db.delete(release).where(eq(release.id, releaseId));
    await db.delete(hub).where(eq(hub.id, hubId));
    await teardownTestRun(seed);
  });

  it('adapter produces a manifest that passes editorialAtlasManifestSchema', async () => {
    const manifest = await adaptArchiveToEditorialAtlas({
      runId: seed.runId,
      hubId,
      releaseId,
    });
    const parsed = editorialAtlasManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      console.error(
        'Manifest validation errors:',
        JSON.stringify(parsed.error.format(), null, 2),
      );
    }
    assert.equal(parsed.success, true);
  });

  it('manifest includes Highlights nav item when orphan quote exists', async () => {
    const manifest = await adaptArchiveToEditorialAtlas({
      runId: seed.runId,
      hubId,
      releaseId,
    });
    assert.ok(manifest.highlights && manifest.highlights.length >= 1);
    assert.ok(manifest.navigation.primary.find((n) => n.label === 'Highlights'));
  });
});
