import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../env-files';
import { runAdaptStage } from '../adapt';
import { runMergeStage } from '../merge';
import { _resetRegistryForTests, registerAllTools } from '../../agents/tools/registry';
import {
  proposeLessonTool,
  proposeFrameworkTool,
} from '../../agents/tools/propose';
import {
  seedTestRun,
  teardownTestRun,
  makeCtx,
  type SeedResult,
} from '../../../test-helpers/fixtures';
import { eq, getDb } from '@creatorcanon/db';
import { hub, release } from '@creatorcanon/db/schema';
import type { R2Client } from '@creatorcanon/adapters';

// In-memory R2 stub.
function makeMockR2(): R2Client & { stored: Map<string, Uint8Array> } {
  const stored = new Map<string, Uint8Array>();
  return {
    bucket: 'mock',
    stored,
    async putObject(input: any) {
      const body =
        typeof input.body === 'string'
          ? new TextEncoder().encode(input.body)
          : new Uint8Array(input.body);
      stored.set(input.key, body);
      return { key: input.key, etag: 'mock' };
    },
    async getObject(key: string) {
      const body = stored.get(key);
      if (!body) throw new Error(`mock R2: key not found: ${key}`);
      return { key, body };
    },
    async getSignedUrl() { return 'mock://url'; },
    async deleteObject() {},
    async headObject(key: string) {
      const body = stored.get(key);
      if (!body) throw new Error(`mock R2: key not found: ${key}`);
      return { key, contentLength: body.length };
    },
    async listObjects() { return { keys: [], isTruncated: false }; },
  } as any;
}

describe('runAdaptStage', () => {
  let seed: SeedResult;
  let hubId: string;
  let releaseId: string;

  before(async () => {
    loadDefaultEnvFiles();
    _resetRegistryForTests();
    registerAllTools();

    seed = await seedTestRun({
      videos: [
        { id: 'vid_ad_v1', title: 'Adapt test video', durationSec: 600 },
      ],
      segments: [
        { id: 'seg_ad_a', videoId: 'vid_ad_v1', startMs: 0, endMs: 30_000, text: 'X' },
        { id: 'seg_ad_b', videoId: 'vid_ad_v1', startMs: 30_000, endMs: 60_000, text: 'Y' },
      ],
    });

    const lesson = await proposeLessonTool.handler(
      {
        title: 'Write to think',
        summary: 'Writing helps clarify reasoning.',
        idea: 'Writing is thinking made visible.',
        evidence: [{ segmentId: 'seg_ad_a' }],
      },
      makeCtx(seed, 'lesson_extractor', 'gpt-5.5'),
    );
    if (!lesson.ok) throw new Error('seed lesson failed');

    const fw = await proposeFrameworkTool.handler(
      {
        title: 'PARA Method',
        summary: 'Organize notes by actionability.',
        principles: [{ title: 'Projects', body: 'Active goals with deadlines.' }],
        evidence: [{ segmentId: 'seg_ad_b' }],
      },
      makeCtx(seed, 'framework_extractor', 'gpt-5.5'),
    );
    if (!fw.ok) throw new Error('seed framework failed');

    await runMergeStage({
      runId: seed.runId,
      workspaceId: seed.workspaceId,
      polishProvider: null,
    });

    hubId = `hub_ad_${seed.runId.slice(-6)}`;
    releaseId = `rel_ad_${seed.runId.slice(-6)}`;
    const db = getDb();

    await db.insert(hub).values({
      id: hubId,
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      subdomain: `adapt-${seed.runId.slice(-6)}`,
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

  it('writes manifest.json to R2 and updates release.manifestR2Key', async () => {
    const r2 = makeMockR2();
    const output = await runAdaptStage({
      runId: seed.runId,
      workspaceId: seed.workspaceId,
      hubId,
      releaseId,
      r2Override: r2,
    });

    // R2 key should follow the artifactKey pattern.
    assert.ok(
      output.manifestR2Key.startsWith(`workspaces/${seed.workspaceId}/runs/${seed.runId}/adapt/`),
    );
    assert.equal(output.templateKey, 'editorial_atlas');

    // The blob should be stored in the mock R2.
    const stored = r2.stored.get(output.manifestR2Key);
    assert.ok(stored, 'manifest blob should be in mock R2');

    // It should be valid JSON.
    const parsed = JSON.parse(new TextDecoder().decode(stored));
    assert.equal(parsed.schemaVersion, 'editorial_atlas_v1');
    assert.ok(parsed.pages.length >= 2, 'at least 2 pages expected');

    // release.manifestR2Key should be updated in the DB.
    const releaseRow = (
      await getDb().select().from(release).where(eq(release.id, releaseId)).limit(1)
    )[0];
    assert.equal(releaseRow?.manifestR2Key, output.manifestR2Key);
  });

  it('throws when hub is not found', async () => {
    const r2 = makeMockR2();
    await assert.rejects(
      () =>
        runAdaptStage({
          runId: seed.runId,
          workspaceId: seed.workspaceId,
          hubId: 'nonexistent_hub',
          releaseId,
          r2Override: r2,
        }),
      /hub.*not found/i,
    );
  });
});
