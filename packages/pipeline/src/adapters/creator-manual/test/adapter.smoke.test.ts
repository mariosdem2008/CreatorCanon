import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, getDb } from '@creatorcanon/db';
import { hub, release } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../../../env-files';
import { _resetRegistryForTests, registerAllTools } from '../../../agents/tools/registry';
import {
  proposeFrameworkTool,
  proposeLessonTool,
  proposeQuoteTool,
  proposeRelationTool,
} from '../../../agents/tools/propose';
import { runMergeStage } from '../../../stages/merge';
import {
  makeCtx,
  seedTestRun,
  teardownTestRun,
  type SeedResult,
} from '../../../../test-helpers/fixtures';
import { adaptArchiveToCreatorManual } from '..';

// Cross-package import for runtime validation only. apps/web is outside the
// pipeline tsconfig include, but tsx can resolve it in tests.
import * as schemaModule from '../../../../../../apps/web/src/lib/hub/creator-manual/schema';

const { creatorManualManifestSchema } = (schemaModule as any).default
  ? (schemaModule as any).default
  : schemaModule;

loadDefaultEnvFiles();

const skipIfNoEnv = !process.env.DATABASE_URL;

describe(
  'creator-manual adapter (smoke)',
  { skip: skipIfNoEnv ? 'DATABASE_URL not set' : false },
  () => {
    let seed: SeedResult;
    let hubId: string;
    let releaseId: string;

    before(async () => {
      _resetRegistryForTests();
      registerAllTools();

      seed = await seedTestRun({
        videos: [
          { id: 'vid_cm_v1', title: 'Creator Manual Source One', durationSec: 600 },
          { id: 'vid_cm_v2', title: 'Creator Manual Source Two', durationSec: 720 },
        ],
        segments: [
          {
            id: 'seg_cm_a',
            videoId: 'vid_cm_v1',
            startMs: 0,
            endMs: 30_000,
            text: 'Writing turns fuzzy thinking into a visible object you can improve.',
          },
          {
            id: 'seg_cm_b',
            videoId: 'vid_cm_v1',
            startMs: 30_000,
            endMs: 60_000,
            text: 'A good operating system turns repeated decisions into reusable defaults.',
          },
          {
            id: 'seg_cm_c',
            videoId: 'vid_cm_v2',
            startMs: 0,
            endMs: 30_000,
            text: 'Frameworks work best when they are small enough to use under pressure.',
          },
        ],
      });

      const lesson = await proposeLessonTool.handler(
        {
          title: 'Write to clarify decisions',
          summary: 'Writing makes reasoning concrete enough to inspect and improve.',
          idea: 'Write the decision down before optimizing it.',
          evidence: [{ segmentId: 'seg_cm_a' }, { segmentId: 'seg_cm_c' }],
        },
        makeCtx(seed, 'lesson_extractor', 'gpt-5.5'),
      );
      if (!lesson.ok) throw new Error('seed lesson failed');

      const framework = await proposeFrameworkTool.handler(
        {
          title: 'Reusable Defaults',
          summary: 'A system for turning repeated decisions into reusable defaults.',
          principles: [{ title: 'Make repeat work explicit', body: 'Name the choice and write the default.' }],
          evidence: [{ segmentId: 'seg_cm_b' }],
        },
        makeCtx(seed, 'framework_extractor', 'gpt-5.5'),
      );
      if (!framework.ok) throw new Error('seed framework failed');

      const quote = await proposeQuoteTool.handler(
        {
          text: 'Write the decision down before optimizing it.',
          evidence: { segmentId: 'seg_cm_a' },
        },
        makeCtx(seed, 'quote_finder', 'gpt-5.5'),
      );
      if (!quote.ok) throw new Error('seed quote failed');

      await proposeRelationTool.handler(
        {
          fromFindingId: quote.findingId,
          toFindingId: lesson.findingId,
          type: 'supports',
          evidence: [{ segmentId: 'seg_cm_a' }],
        },
        makeCtx(seed, 'quote_finder', 'gpt-5.5'),
      );

      await runMergeStage({
        runId: seed.runId,
        workspaceId: seed.workspaceId,
        polishProvider: null,
      });

      hubId = `hub_cm_${seed.runId.slice(-6)}`;
      releaseId = `rel_cm_${seed.runId.slice(-6)}`;
      const db = getDb();

      await db.insert(hub).values({
        id: hubId,
        workspaceId: seed.workspaceId,
        projectId: seed.projectId,
        subdomain: `manual-${seed.runId.slice(-6)}`,
        templateKey: 'creator_manual',
        accessMode: 'public',
        metadata: {
          tagline: 'A source-backed operating manual for the creator archive.',
          brand: {
            name: 'Fixture Manual',
            tone: 'Concise and practical.',
          },
        } as any,
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
      if (!seed) return;
      const db = getDb();
      await db.delete(release).where(eq(release.id, releaseId));
      await db.delete(hub).where(eq(hub.id, hubId));
      await teardownTestRun(seed);
    });

    it('produces a manifest that passes creatorManualManifestSchema', async () => {
      const manifest = await adaptArchiveToCreatorManual({
        runId: seed.runId,
        hubId,
        releaseId,
      });
      const parsed = creatorManualManifestSchema.safeParse(manifest);
      if (!parsed.success) {
        console.error('Manifest validation errors:', JSON.stringify(parsed.error.format(), null, 2));
      }

      assert.equal(parsed.success, true);
      assert.equal(manifest.schemaVersion, 'creator_manual_v1');
      assert.equal(manifest.template.id, 'creator-manual');
      assert.ok(manifest.nodes.length >= 1);
      assert.ok(manifest.sources.length >= 1);
      assert.ok(manifest.search.length >= manifest.nodes.length);
    });
  },
);
