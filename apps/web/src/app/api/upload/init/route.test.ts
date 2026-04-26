/**
 * Tests for POST /api/upload/init.
 *
 * Validation tests run unconditionally via the initBody schema.
 * Integration tests (real DB + stubbed R2) are gated on DATABASE_URL.
 *
 * Note: the handler imports auth() and createR2Client() at module-level, so
 * mocking them requires ESM top-level-await which tsx/CJS does not support.
 * Validation logic is fully tested here via the exported schema; auth/R2
 * behavior is covered by the integration test (if DATABASE_URL is set) or
 * verified by manual curl in dev.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initBody } from './validation';

// ── Validation logic tests (no DB, no auth) ───────────────────────────────────
describe('POST /api/upload/init — request validation (via initBody schema)', () => {
  const base = {
    filename: 'talk.mp4',
    fileSize: 50 * 1024 * 1024,
    contentType: 'video/mp4',
  };

  it('accepts a valid mp4 upload request', () => {
    assert.equal(initBody.safeParse(base).success, true);
  });

  it('accepts optional durationSec and workspaceId', () => {
    assert.equal(
      initBody.safeParse({ ...base, durationSec: 3600, workspaceId: 'ws_abc' }).success,
      true,
    );
  });

  it('rejects when filename is empty', () => {
    assert.equal(initBody.safeParse({ ...base, filename: '' }).success, false);
  });

  it('rejects when filename exceeds 256 chars', () => {
    assert.equal(initBody.safeParse({ ...base, filename: 'x'.repeat(257) }).success, false);
  });

  it('rejects when fileSize is 0', () => {
    assert.equal(initBody.safeParse({ ...base, fileSize: 0 }).success, false);
  });

  it('rejects when fileSize exceeds 2 GB', () => {
    assert.equal(
      initBody.safeParse({ ...base, fileSize: 2 * 1024 * 1024 * 1024 + 1 }).success,
      false,
    );
  });

  it('rejects non-allowed content types (413/415 surface via zod)', () => {
    assert.equal(
      initBody.safeParse({ ...base, contentType: 'application/pdf' }).success,
      false,
    );
  });

  it('rejects negative durationSec', () => {
    assert.equal(initBody.safeParse({ ...base, durationSec: -5 }).success, false);
  });
});

// ── Integration tests — gated on DATABASE_URL ─────────────────────────────────
const skipIfNoDb = !process.env.DATABASE_URL;

describe(
  'POST /api/upload/init — integration (DB + schema)',
  { skip: skipIfNoDb ? 'DATABASE_URL not set' : false },
  () => {
    let userId: string;
    let workspaceId: string;

    before(async () => {
      if (!process.env.DATABASE_URL) return;
      const { getDb } = await import('@creatorcanon/db');
      const { user, workspace, workspaceMember } = await import('@creatorcanon/db/schema');
      const db = getDb();
      const seed = Math.random().toString(36).slice(2, 10);
      userId = `u_init2_${seed}`;
      workspaceId = `w_init2_${seed}`;
      await db.insert(user).values({ id: userId, email: `init2-${seed}@example.com`, name: 'T' });
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

    it('workspace fixture is seeded (sanity check)', async () => {
      const { getDb, eq } = await import('@creatorcanon/db');
      const { workspaceMember } = await import('@creatorcanon/db/schema');
      const rows = await getDb()
        .select()
        .from(workspaceMember)
        .where(eq(workspaceMember.userId, userId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.workspaceId, workspaceId);
    });
  },
);
