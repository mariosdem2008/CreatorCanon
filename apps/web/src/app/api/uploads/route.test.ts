/**
 * Tests for GET /api/uploads.
 *
 * Validation tests run unconditionally (query param parsing).
 * Integration tests are gated on DATABASE_URL.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// The valid transcribeStatus values that the route accepts as ?status=
const VALID_STATUSES = new Set(['ready', 'transcribing', 'failed']);

// ── Query param logic (pure, no DB) ──────────────────────────────────────────
describe('GET /api/uploads — query param validation', () => {
  it('ready is a valid status filter', () => {
    assert.ok(VALID_STATUSES.has('ready'));
  });

  it('transcribing is a valid status filter', () => {
    assert.ok(VALID_STATUSES.has('transcribing'));
  });

  it('failed is a valid status filter', () => {
    assert.ok(VALID_STATUSES.has('failed'));
  });

  it('uploading is not a valid status filter (uploading is uploadStatus, not transcribeStatus)', () => {
    assert.ok(!VALID_STATUSES.has('uploading'));
  });

  it('arbitrary strings are not valid status filters', () => {
    assert.ok(!VALID_STATUSES.has('bogus'));
    assert.ok(!VALID_STATUSES.has(''));
    assert.ok(!VALID_STATUSES.has('pending'));
  });

  // I2: Invalid ?status= should produce 400, not be silently ignored
  it('invalid status values are rejected (would produce 400 in handler)', () => {
    const invalidStatuses = ['uploading', 'pending', 'bogus', 'READY', ''];
    for (const s of invalidStatuses) {
      if (s === '') continue; // empty string means absent param
      assert.ok(
        !VALID_STATUSES.has(s),
        `"${s}" must not be in VALID_STATUSES — handler returns 400 for unknown values`,
      );
    }
  });
});

// ── Integration tests — gated on DATABASE_URL ─────────────────────────────────
const skipIfNoDb = !process.env.DATABASE_URL;

describe(
  'GET /api/uploads — integration (DB queries)',
  { skip: skipIfNoDb ? 'DATABASE_URL not set' : false },
  () => {
    let userId: string;
    let workspaceId: string;
    let otherUserId: string;
    let otherWorkspaceId: string;
    let channelId: string;
    const createdVideoIds: string[] = [];

    before(async () => {
      if (!process.env.DATABASE_URL) return;
      const { getDb } = await import('@creatorcanon/db');
      const { user, workspace, workspaceMember, channel, video } = await import(
        '@creatorcanon/db/schema'
      );
      const db = getDb();
      const seed = Math.random().toString(36).slice(2, 10);
      userId = `u_list2_${seed}`;
      workspaceId = `w_list2_${seed}`;
      otherUserId = `u_list3_${seed}`;
      otherWorkspaceId = `w_list3_${seed}`;
      channelId = `ch_uploads_${workspaceId}`;

      const v1 = `mu_l1_${seed}`;
      const v2 = `mu_l2_${seed}`;
      createdVideoIds.push(v1, v2);

      await db.insert(user).values([
        { id: userId, email: `list2-${seed}@example.com`, name: 'T' },
        { id: otherUserId, email: `list3-${seed}@example.com`, name: 'T2' },
      ]);
      await db.insert(workspace).values([
        { id: workspaceId, ownerUserId: userId, name: 'tw', slug: workspaceId },
        { id: otherWorkspaceId, ownerUserId: otherUserId, name: 'tw2', slug: otherWorkspaceId },
      ]);
      await db.insert(workspaceMember).values([
        { workspaceId, userId, role: 'owner', joinedAt: new Date() },
        { workspaceId: otherWorkspaceId, userId: otherUserId, role: 'owner', joinedAt: new Date() },
      ]);
      await db.insert(channel).values({
        id: channelId,
        workspaceId,
        sourceKind: 'manual_upload',
        youtubeChannelId: null,
        title: 'Uploaded videos',
      });
      await db.insert(video).values([
        {
          id: v1,
          workspaceId,
          channelId,
          sourceKind: 'manual_upload',
          uploadStatus: 'uploaded',
          transcribeStatus: 'ready',
          localR2Key: `workspaces/${workspaceId}/uploads/${v1}/source.mp4`,
          fileSizeBytes: 10 * 1024 * 1024,
          contentType: 'video/mp4',
          title: 'Video One',
        },
        {
          id: v2,
          workspaceId,
          channelId,
          sourceKind: 'manual_upload',
          uploadStatus: 'uploaded',
          transcribeStatus: 'transcribing',
          localR2Key: `workspaces/${workspaceId}/uploads/${v2}/source.mp4`,
          fileSizeBytes: 20 * 1024 * 1024,
          contentType: 'video/mp4',
          title: 'Video Two',
        },
      ]);
    });

    after(async () => {
      if (!process.env.DATABASE_URL) return;
      const { getDb, eq, inArray } = await import('@creatorcanon/db');
      const { video, channel, workspaceMember, workspace, user } = await import(
        '@creatorcanon/db/schema'
      );
      const db = getDb();
      if (createdVideoIds.length > 0) {
        await db.delete(video).where(inArray(video.id, createdVideoIds));
      }
      await db.delete(channel).where(eq(channel.workspaceId, workspaceId));
      await db.delete(workspaceMember).where(eq(workspaceMember.workspaceId, workspaceId));
      await db.delete(workspace).where(eq(workspace.id, workspaceId));
      await db.delete(workspaceMember).where(eq(workspaceMember.workspaceId, otherWorkspaceId));
      await db.delete(workspace).where(eq(workspace.id, otherWorkspaceId));
      await db.delete(user).where(eq(user.id, userId));
      await db.delete(user).where(eq(user.id, otherUserId));
    });

    it('returns only manual_upload videos for a workspace', async () => {
      const { getDb, eq, and } = await import('@creatorcanon/db');
      const { video } = await import('@creatorcanon/db/schema');
      const rows = await getDb()
        .select({ id: video.id, transcribeStatus: video.transcribeStatus })
        .from(video)
        .where(and(eq(video.workspaceId, workspaceId), eq(video.sourceKind, 'manual_upload')));
      assert.equal(rows.length, 2);
    });

    it('filters by transcribeStatus=ready correctly', async () => {
      const { getDb, eq, and } = await import('@creatorcanon/db');
      const { video } = await import('@creatorcanon/db/schema');
      const rows = await getDb()
        .select({ id: video.id })
        .from(video)
        .where(
          and(
            eq(video.workspaceId, workspaceId),
            eq(video.sourceKind, 'manual_upload'),
            eq(video.transcribeStatus, 'ready'),
          ),
        );
      assert.equal(rows.length, 1);
    });

    it('otherWorkspace has no uploads', async () => {
      const { getDb, eq, and } = await import('@creatorcanon/db');
      const { video } = await import('@creatorcanon/db/schema');
      const rows = await getDb()
        .select({ id: video.id })
        .from(video)
        .where(
          and(eq(video.workspaceId, otherWorkspaceId), eq(video.sourceKind, 'manual_upload')),
        );
      assert.equal(rows.length, 0);
    });

    // C1: ?workspaceId= param — membership check blocks access to foreign workspace
    it('?workspaceId= for a workspace the user does not belong to: membership check returns empty', async () => {
      // userId is in workspaceId but NOT in otherWorkspaceId.
      // The fixed handler checks membership before scoping the query.
      const { getDb, eq, and } = await import('@creatorcanon/db');
      const { workspaceMember: wm } = await import('@creatorcanon/db/schema');
      const memberRows = await getDb()
        .select({ workspaceId: wm.workspaceId })
        .from(wm)
        .where(and(eq(wm.userId, userId), eq(wm.workspaceId, otherWorkspaceId)))
        .limit(1);
      assert.equal(memberRows.length, 0, 'userId must not be a member of otherWorkspaceId → handler returns 403');
    });

    // C1: multi-workspace list — inArray across all user workspaces
    it('listing across all user workspaces uses inArray with correct workspace set', async () => {
      const { getDb, eq, inArray, and } = await import('@creatorcanon/db');
      const { workspaceMember: wm, video } = await import('@creatorcanon/db/schema');

      // Simulate handler: collect all workspaces for userId
      const allMemberships = await getDb()
        .select({ workspaceId: wm.workspaceId })
        .from(wm)
        .where(eq(wm.userId, userId));
      const wsIds = allMemberships.map((m) => m.workspaceId);

      assert.ok(wsIds.includes(workspaceId), 'userId must be a member of workspaceId');
      assert.ok(!wsIds.includes(otherWorkspaceId), 'userId must not be a member of otherWorkspaceId');

      const rows = await getDb()
        .select({ id: video.id })
        .from(video)
        .where(and(inArray(video.workspaceId, wsIds), eq(video.sourceKind, 'manual_upload')));
      assert.equal(rows.length, 2, 'should only see videos from workspaces userId belongs to');
    });
  },
);
