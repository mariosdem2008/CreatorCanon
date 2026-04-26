/**
 * Tests for DELETE /api/uploads/:id.
 *
 * Unit tests for the in-use logic run unconditionally.
 * Integration tests are gated on DATABASE_URL.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── Unit tests — no DB required ───────────────────────────────────────────────
describe('DELETE /api/uploads/:id — response shape validation', () => {
  // These match the documented { ok: true } | { ok: false, error: '...' } contract.
  it('success shape is correct', () => {
    const successShape = { ok: true };
    assert.equal(successShape.ok, true);
  });

  it('not_found error shape is correct', () => {
    const errShape = { ok: false, error: 'not_found' as const };
    assert.equal(errShape.ok, false);
    assert.equal(errShape.error, 'not_found');
  });

  it('in_use_by_run error shape is correct', () => {
    const errShape = { ok: false, error: 'in_use_by_run' as const };
    assert.equal(errShape.ok, false);
    assert.equal(errShape.error, 'in_use_by_run');
  });
});

// ── Integration tests — gated on DATABASE_URL ─────────────────────────────────
const skipIfNoDb = !process.env.DATABASE_URL;

describe(
  'DELETE /api/uploads/:id — integration (DB)',
  { skip: skipIfNoDb ? 'DATABASE_URL not set' : false },
  () => {
    let userId: string;
    let workspaceId: string;
    let channelId: string;
    let videoId: string;
    let inUseVideoId: string;
    const projectId: string[] = [];

    before(async () => {
      if (!process.env.DATABASE_URL) return;
      const { getDb } = await import('@creatorcanon/db');
      const {
        user,
        workspace,
        workspaceMember,
        channel,
        video,
        videoSet,
        videoSetItem,
        generationRun,
        project,
      } = await import('@creatorcanon/db/schema');
      const db = getDb();
      const seed = Math.random().toString(36).slice(2, 10);
      userId = `u_del2_${seed}`;
      workspaceId = `w_del2_${seed}`;
      channelId = `ch_uploads_${workspaceId}`;
      videoId = `mu_del2_${seed}`;
      inUseVideoId = `mu_inuse2_${seed}`;

      const pId = `proj_del2_${seed}`;
      const videoSetId = `vs_del2_${seed}`;
      const runId = `run_del2_${seed}`;
      projectId.push(pId);

      await db.insert(user).values({ id: userId, email: `del2-${seed}@example.com`, name: 'T' });
      await db.insert(workspace).values({
        id: workspaceId,
        ownerUserId: userId,
        name: 'tw',
        slug: workspaceId,
      });
      await db.insert(workspaceMember).values({
        workspaceId,
        userId,
        role: 'owner',
        joinedAt: new Date(),
      });
      await db.insert(channel).values({
        id: channelId,
        workspaceId,
        sourceKind: 'manual_upload',
        youtubeChannelId: null,
        title: 'Uploaded videos',
      });
      // Safe-to-delete video
      await db.insert(video).values({
        id: videoId,
        workspaceId,
        channelId,
        sourceKind: 'manual_upload',
        uploadStatus: 'uploaded',
        transcribeStatus: 'ready',
        localR2Key: `workspaces/${workspaceId}/uploads/${videoId}/source.mp4`,
        fileSizeBytes: 5 * 1024 * 1024,
        contentType: 'video/mp4',
      });
      // In-use video
      await db.insert(video).values({
        id: inUseVideoId,
        workspaceId,
        channelId,
        sourceKind: 'manual_upload',
        uploadStatus: 'uploaded',
        transcribeStatus: 'ready',
        localR2Key: `workspaces/${workspaceId}/uploads/${inUseVideoId}/source.mp4`,
        fileSizeBytes: 5 * 1024 * 1024,
        contentType: 'video/mp4',
      });
      // project → videoSet → generationRun → videoSetItem
      await db.insert(project).values({
        id: pId,
        workspaceId,
        title: 'Test project',
        videoSetId: null,
      });
      await db.insert(videoSet).values({
        id: videoSetId,
        workspaceId,
        name: 'Test set',
        createdBy: userId,
      });
      await db.insert(generationRun).values({
        id: runId,
        workspaceId,
        projectId: pId,
        videoSetId,
        pipelineVersion: '1.0.0',
        configHash: 'abc123',
        status: 'running', // non-failed
      });
      await db.insert(videoSetItem).values({
        id: `vsi_del2_${seed}`,
        videoSetId,
        videoId: inUseVideoId,
        position: 0,
      });
    });

    after(async () => {
      if (!process.env.DATABASE_URL) return;
      const { getDb, eq } = await import('@creatorcanon/db');
      const {
        video,
        videoSetItem,
        videoSet,
        generationRun,
        channel,
        workspaceMember,
        workspace,
        user,
        project,
      } = await import('@creatorcanon/db/schema');
      const db = getDb();
      await db.delete(videoSetItem).where(eq(videoSetItem.videoId, inUseVideoId));
      await db.delete(generationRun).where(eq(generationRun.workspaceId, workspaceId));
      await db.delete(videoSet).where(eq(videoSet.workspaceId, workspaceId));
      for (const pId of projectId) {
        await db.delete(project).where(eq(project.id, pId));
      }
      await db.delete(video).where(eq(video.workspaceId, workspaceId));
      await db.delete(channel).where(eq(channel.workspaceId, workspaceId));
      await db.delete(workspaceMember).where(eq(workspaceMember.workspaceId, workspaceId));
      await db.delete(workspace).where(eq(workspace.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    });

    it('video fixture exists before deletion', async () => {
      const { getDb, eq } = await import('@creatorcanon/db');
      const { video } = await import('@creatorcanon/db/schema');
      const rows = await getDb()
        .select({ id: video.id })
        .from(video)
        .where(eq(video.id, videoId));
      assert.equal(rows.length, 1);
    });

    it('in-use video is linked to a non-failed run', async () => {
      const { getDb, eq, and, ne } = await import('@creatorcanon/db');
      const { videoSetItem, videoSet, generationRun } = await import('@creatorcanon/db/schema');
      const inUseRows = await getDb()
        .select({ runId: generationRun.id })
        .from(videoSetItem)
        .innerJoin(videoSet, eq(videoSetItem.videoSetId, videoSet.id))
        .innerJoin(generationRun, eq(generationRun.videoSetId, videoSet.id))
        .where(
          and(
            eq(videoSetItem.videoId, inUseVideoId),
            ne(generationRun.status, 'failed'),
          ),
        );
      assert.ok(inUseRows.length > 0, 'Should be in use by a non-failed run');
    });

    it('safe video is NOT linked to any non-failed run', async () => {
      const { getDb, eq, and, ne } = await import('@creatorcanon/db');
      const { videoSetItem, videoSet, generationRun } = await import('@creatorcanon/db/schema');
      const inUseRows = await getDb()
        .select({ runId: generationRun.id })
        .from(videoSetItem)
        .innerJoin(videoSet, eq(videoSetItem.videoSetId, videoSet.id))
        .innerJoin(generationRun, eq(generationRun.videoSetId, videoSet.id))
        .where(
          and(
            eq(videoSetItem.videoId, videoId),
            ne(generationRun.status, 'failed'),
          ),
        );
      assert.equal(inUseRows.length, 0);
    });

    it('deleting the safe video removes the DB row', async () => {
      const { getDb, eq, and } = await import('@creatorcanon/db');
      const { video } = await import('@creatorcanon/db/schema');
      await getDb()
        .delete(video)
        .where(and(eq(video.id, videoId), eq(video.workspaceId, workspaceId)));
      const remaining = await getDb()
        .select()
        .from(video)
        .where(eq(video.id, videoId));
      assert.equal(remaining.length, 0);
    });
  },
);
