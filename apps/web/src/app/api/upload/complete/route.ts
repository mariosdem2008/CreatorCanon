import { NextResponse } from 'next/server';
import { auth } from '@creatorcanon/auth';
import { and, eq, getDb } from '@creatorcanon/db';
import { workspaceMember, video } from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const completeBody = z.object({
  videoId: z.string().min(1),
});

export async function POST(req: Request) {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // 2. Body validation
  const parsed = completeBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { videoId } = parsed.data;

  const db = getDb();

  // 3. Load video row by ID — workspace comes from the resource, not from the user's first workspace
  const rows = await db
    .select({
      id: video.id,
      workspaceId: video.workspaceId,
      uploadStatus: video.uploadStatus,
      localR2Key: video.localR2Key,
      fileSizeBytes: video.fileSizeBytes,
    })
    .from(video)
    .where(eq(video.id, videoId))
    .limit(1);

  if (!rows[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const row = rows[0];

  // 4. Verify the caller is a member of the resource's workspace
  const member = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(and(eq(workspaceMember.userId, userId), eq(workspaceMember.workspaceId, row.workspaceId)))
    .limit(1);
  if (!member[0]) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const workspaceId = row.workspaceId;

  // 5. State check — must be 'uploading'
  if (row.uploadStatus !== 'uploading') {
    return NextResponse.json(
      { error: 'Upload already completed or failed', uploadStatus: row.uploadStatus },
      { status: 409 },
    );
  }

  // 6. HEAD the R2 object to confirm upload
  const r2 = createR2Client(parseServerEnv(process.env));
  const r2Key = row.localR2Key!;
  let head;
  try {
    head = await r2.headObject(r2Key);
  } catch {
    // Object missing — mark failed
    await db
      .update(video)
      .set({ uploadStatus: 'failed' })
      .where(and(eq(video.id, videoId), eq(video.workspaceId, workspaceId)));
    return NextResponse.json(
      { error: 'Upload not found in storage', videoId },
      { status: 422 },
    );
  }

  // 7. Content-length check — compare actual upload size to declared size
  if (row.fileSizeBytes != null && head.contentLength !== row.fileSizeBytes) {
    await db
      .update(video)
      .set({ uploadStatus: 'failed' })
      .where(and(eq(video.id, videoId), eq(video.workspaceId, workspaceId)));
    return NextResponse.json(
      {
        error: `Uploaded size (${head.contentLength}) does not match declared size (${row.fileSizeBytes})`,
      },
      { status: 422 },
    );
  }

  // 8. Update video row
  await db
    .update(video)
    .set({ uploadStatus: 'uploaded', transcribeStatus: 'transcribing' })
    .where(and(eq(video.id, videoId), eq(video.workspaceId, workspaceId)));

  // 9. TODO(Phase D): wire to actual Trigger.dev task once transcribe-uploaded-video exists.
  console.log(`[upload-complete] would enqueue transcribe-uploaded-video for ${videoId}`);

  return NextResponse.json({ ok: true, videoId, transcribeStatus: 'transcribing' });
}
