import { NextResponse } from 'next/server';
import { auth } from '@creatorcanon/auth';
import { and, eq, getDb } from '@creatorcanon/db';
import { workspaceMember, video } from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { getOrCreateUploadChannel } from '@/lib/uploads/synthetic-channel';
import { fileExtFromContentType } from '@/lib/uploads/contentTypes';
import { initBody } from './validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // 2. Body validation
  let body: ReturnType<typeof initBody.parse>;
  try {
    body = initBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { filename: _filename, fileSize, contentType, durationSec, workspaceId: bodyWorkspaceId } = body;

  // 3. Workspace lookup
  const db = getDb();
  let workspaceId: string;

  if (bodyWorkspaceId) {
    // Verify caller is a member of the supplied workspace
    const members = await db
      .select({ workspaceId: workspaceMember.workspaceId })
      .from(workspaceMember)
      .where(
        and(
          eq(workspaceMember.workspaceId, bodyWorkspaceId),
          eq(workspaceMember.userId, userId),
        ),
      )
      .limit(1);
    if (!members[0]) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    workspaceId = bodyWorkspaceId;
  } else {
    // Auto-detect: list all workspaces the user belongs to; use first (init supplies workspaceId in practice)
    const members = await db
      .select({ workspaceId: workspaceMember.workspaceId })
      .from(workspaceMember)
      .where(eq(workspaceMember.userId, userId))
      .limit(1);
    if (!members[0]) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }
    workspaceId = members[0].workspaceId;
  }

  // 4. Get or create synthetic upload channel
  const channelId = await getOrCreateUploadChannel(workspaceId);

  // 5. Generate videoId
  const videoId = 'mu_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);

  // 6. Build R2 key
  const ext = fileExtFromContentType(contentType);
  const r2Key = `workspaces/${workspaceId}/uploads/${videoId}/source.${ext}`;

  // 7. Sign URL FIRST — before DB insert so a signing failure leaves no orphan row
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  let uploadUrl: string;
  try {
    uploadUrl = await r2.getSignedUrl({
      key: r2Key,
      operation: 'put',
      expiresInSeconds: 1800,
      contentType,
    });
  } catch (err) {
    console.error('[upload-init] R2 signing failed:', err);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }

  // 8. Insert DB row — after URL signing so a signing failure leaves no dangling row
  try {
    await db.insert(video).values({
      id: videoId,
      workspaceId,
      channelId,
      sourceKind: 'manual_upload',
      uploadStatus: 'uploading',
      transcribeStatus: 'pending',
      localR2Key: r2Key,
      fileSizeBytes: fileSize,
      contentType,
      durationSeconds: durationSec ?? null,
      title: null,
    });
  } catch (err) {
    console.error('[upload-init] DB insert failed:', err);
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
  }

  return NextResponse.json({ videoId, uploadUrl, r2Key });
}
