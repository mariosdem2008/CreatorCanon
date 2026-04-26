import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateUploadChannel } from './synthetic-channel';
import { getDb, eq } from '@creatorcanon/db';
import { workspace, channel, user } from '@creatorcanon/db/schema';

const skipIfNoDb = !process.env.DATABASE_URL;

describe('getOrCreateUploadChannel', { skip: skipIfNoDb ? 'DATABASE_URL not set' : false }, () => {
  let workspaceId: string;
  let userId: string;

  before(async () => {
    if (!process.env.DATABASE_URL) return;
    const db = getDb();
    const seed = Math.random().toString(36).slice(2, 10);
    userId = `u_${seed}`;
    workspaceId = `w_${seed}`;
    await db.insert(user).values({ id: userId, email: `t-${userId}@example.com`, name: 'T' });
    await db.insert(workspace).values({ id: workspaceId, ownerUserId: userId, name: 'tw', slug: workspaceId });
  });

  after(async () => {
    if (!process.env.DATABASE_URL) return;
    const db = getDb();
    await db.delete(channel).where(eq(channel.workspaceId, workspaceId));
    await db.delete(workspace).where(eq(workspace.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
  });

  it('creates the channel on first call', async () => {
    const a = await getOrCreateUploadChannel(workspaceId);
    assert.equal(a, `ch_uploads_${workspaceId}`);
    const rows = await getDb().select().from(channel).where(eq(channel.id, a));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.sourceKind, 'manual_upload');
    assert.equal(rows[0]?.workspaceId, workspaceId);
    assert.equal(rows[0]?.youtubeChannelId, null);
    assert.equal(rows[0]?.title, 'Uploaded videos');
  });

  it('is idempotent — second call returns same id without creating duplicate', async () => {
    const a = await getOrCreateUploadChannel(workspaceId);
    const b = await getOrCreateUploadChannel(workspaceId);
    assert.equal(a, b);
    const rows = await getDb().select().from(channel).where(eq(channel.id, a));
    assert.equal(rows.length, 1);
  });
});
