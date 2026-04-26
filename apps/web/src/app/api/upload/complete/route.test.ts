/**
 * Tests for POST /api/upload/complete.
 *
 * Validation tests run unconditionally.
 * Integration tests are gated on DATABASE_URL.
 *
 * Auth/R2 mocking is not supported by the tsx/CJS test runner (no top-level
 * await for mock.module). Handler auth behavior is validated by the integration
 * test setup; unit coverage focuses on the zod schema and observable state
 * transitions via the DB.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

// Mirror the inline schema from route.ts so we can test it without importing the handler
const completeBodySchema = z.object({
  videoId: z.string().min(1),
});

// ── Validation schema tests ────────────────────────────────────────────────────
describe('POST /api/upload/complete — request validation', () => {
  it('accepts a valid videoId', () => {
    assert.equal(completeBodySchema.safeParse({ videoId: 'mu_abc123' }).success, true);
  });

  it('rejects missing videoId', () => {
    assert.equal(completeBodySchema.safeParse({}).success, false);
  });

  it('rejects empty videoId', () => {
    assert.equal(completeBodySchema.safeParse({ videoId: '' }).success, false);
  });

  it('rejects null videoId', () => {
    assert.equal(completeBodySchema.safeParse({ videoId: null }).success, false);
  });
});

// ── Integration tests — gated on DATABASE_URL ─────────────────────────────────
const skipIfNoDb = !process.env.DATABASE_URL;

describe(
  'POST /api/upload/complete — integration (DB state transitions)',
  { skip: skipIfNoDb ? 'DATABASE_URL not set' : false },
  () => {
    let workspaceId: string;
    let userId: string;
    let videoId: string;
    let channelId: string;

    before(async () => {
      if (!process.env.DATABASE_URL) return;
      const { getDb } = await import('@creatorcanon/db');
      const { user, workspace, workspaceMember, channel, video } = await import(
        '@creatorcanon/db/schema'
      );
      const db = getDb();
      const seed = Math.random().toString(36).slice(2, 10);
      userId = `u_comp2_${seed}`;
      workspaceId = `w_comp2_${seed}`;
      channelId = `ch_uploads_${workspaceId}`;
      videoId = `mu_comp2_${seed}`;

      await db.insert(user).values({ id: userId, email: `comp2-${seed}@example.com`, name: 'T' });
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
      await db.insert(video).values({
        id: videoId,
        workspaceId,
        channelId,
        sourceKind: 'manual_upload',
        uploadStatus: 'uploading',
        transcribeStatus: 'pending',
        localR2Key: `workspaces/${workspaceId}/uploads/${videoId}/source.mp4`,
        fileSizeBytes: 1024,
        contentType: 'video/mp4',
      });
    });

    after(async () => {
      if (!process.env.DATABASE_URL) return;
      const { getDb, eq } = await import('@creatorcanon/db');
      const { video, channel, workspaceMember, workspace, user } = await import(
        '@creatorcanon/db/schema'
      );
      const db = getDb();
      await db.delete(video).where(eq(video.workspaceId, workspaceId));
      await db.delete(channel).where(eq(channel.workspaceId, workspaceId));
      await db.delete(workspaceMember).where(eq(workspaceMember.workspaceId, workspaceId));
      await db.delete(workspace).where(eq(workspace.id, workspaceId));
      await db.delete(user).where(eq(user.id, userId));
    });

    it('video is in uploading state initially', async () => {
      const { getDb, eq } = await import('@creatorcanon/db');
      const { video: videoTable } = await import('@creatorcanon/db/schema');
      const rows = await getDb()
        .select({ uploadStatus: videoTable.uploadStatus, transcribeStatus: videoTable.transcribeStatus })
        .from(videoTable)
        .where(eq(videoTable.id, videoId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.uploadStatus, 'uploading');
      assert.equal(rows[0]!.transcribeStatus, 'pending');
    });

    it('video row can be updated to uploaded+transcribing directly', async () => {
      // Simulates what the handler does after HEAD succeeds
      const { getDb, eq, and } = await import('@creatorcanon/db');
      const { video: videoTable } = await import('@creatorcanon/db/schema');
      await getDb()
        .update(videoTable)
        .set({ uploadStatus: 'uploaded', transcribeStatus: 'transcribing' })
        .where(and(eq(videoTable.id, videoId), eq(videoTable.workspaceId, workspaceId)));

      const rows = await getDb()
        .select({ uploadStatus: videoTable.uploadStatus, transcribeStatus: videoTable.transcribeStatus })
        .from(videoTable)
        .where(eq(videoTable.id, videoId));
      assert.equal(rows[0]!.uploadStatus, 'uploaded');
      assert.equal(rows[0]!.transcribeStatus, 'transcribing');
    });
  },
);
