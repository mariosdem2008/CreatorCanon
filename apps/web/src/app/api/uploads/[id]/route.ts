import { NextResponse } from 'next/server';
import { auth } from '@creatorcanon/auth';
import { and, eq, getDb, ne } from '@creatorcanon/db';
import { workspaceMember, video, videoSetItem, videoSet, generationRun } from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const videoId = params.id;

  // 1. Auth
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // 2. Workspace lookup
  const db = getDb();
  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);
  if (!members[0]) {
    return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
  }
  const workspaceId = members[0].workspaceId;

  // 3. Load video row
  const rows = await db
    .select({
      id: video.id,
      workspaceId: video.workspaceId,
      localR2Key: video.localR2Key,
    })
    .from(video)
    .where(and(eq(video.id, videoId), eq(video.workspaceId, workspaceId)))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const row = rows[0];

  // 4. Check if video is in use by any non-failed generation run
  //    Path: video → videoSetItem → videoSet → generationRun
  const inUseRows = await db
    .select({ runId: generationRun.id })
    .from(videoSetItem)
    .innerJoin(videoSet, eq(videoSetItem.videoSetId, videoSet.id))
    .innerJoin(generationRun, eq(generationRun.videoSetId, videoSet.id))
    .where(
      and(
        eq(videoSetItem.videoId, videoId),
        ne(generationRun.status, 'failed'),
      ),
    )
    .limit(1);

  if (inUseRows.length > 0) {
    return NextResponse.json({ ok: false, error: 'in_use_by_run' }, { status: 409 });
  }

  // 5. Delete R2 object(s) — best-effort
  if (row.localR2Key) {
    const r2 = createR2Client(parseServerEnv(process.env));
    try {
      await r2.deleteObject(row.localR2Key);
    } catch (err) {
      console.warn(`[upload-delete] R2 delete failed for ${row.localR2Key}:`, err);
    }
    // Also attempt to delete extracted audio (if exists)
    const audioKey = row.localR2Key.replace(/\/source\.[^/]+$/, '/audio.m4a');
    if (audioKey !== row.localR2Key) {
      try {
        await r2.deleteObject(audioKey);
      } catch {
        // Ignore — audio file may not exist
      }
    }
  }

  // 6. Delete the video row (cascades to transcriptAsset, etc.)
  await db
    .delete(video)
    .where(and(eq(video.id, videoId), eq(video.workspaceId, workspaceId)));

  return NextResponse.json({ ok: true });
}
