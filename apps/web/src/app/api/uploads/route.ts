import { NextResponse } from 'next/server';
import { auth } from '@creatorcanon/auth';
import { and, asc, eq, getDb, inArray } from '@creatorcanon/db';
import { workspaceMember, video } from '@creatorcanon/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UploadStatus = 'uploading' | 'uploaded' | 'failed';
type TranscribeStatus = 'pending' | 'transcribing' | 'ready' | 'failed';

// Status values accepted in ?status= query param (maps to transcribeStatus)
const VALID_TRANSCRIBE_STATUSES = new Set<string>(['ready', 'transcribing', 'failed']);

export async function GET(req: Request) {
  // 1. Auth
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const url = new URL(req.url);

  // 2. Validate ?status= param — return 400 on invalid values instead of silently ignoring
  const statusParam = url.searchParams.get('status');
  if (statusParam && !VALID_TRANSCRIBE_STATUSES.has(statusParam)) {
    return NextResponse.json({ error: `Invalid status: ${statusParam}` }, { status: 400 });
  }
  const filterStatus: TranscribeStatus | null = statusParam ? (statusParam as TranscribeStatus) : null;

  const db = getDb();

  // 3. Resolve which workspace(s) to query
  //    If ?workspaceId= is supplied, verify membership and scope to that workspace.
  //    Otherwise, list across ALL of the user's workspaces (prevents silent wrong-workspace results).
  const workspaceIdParam = url.searchParams.get('workspaceId');
  let workspaceIds: string[];

  if (workspaceIdParam) {
    const m = await db
      .select({ workspaceId: workspaceMember.workspaceId })
      .from(workspaceMember)
      .where(and(eq(workspaceMember.userId, userId), eq(workspaceMember.workspaceId, workspaceIdParam)))
      .limit(1);
    if (!m[0]) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    workspaceIds = [workspaceIdParam];
  } else {
    const all = await db
      .select({ workspaceId: workspaceMember.workspaceId })
      .from(workspaceMember)
      .where(eq(workspaceMember.userId, userId));
    workspaceIds = all.map((m) => m.workspaceId);
  }

  if (workspaceIds.length === 0) {
    return NextResponse.json({ uploads: [] });
  }

  // 4. Query videos
  const whereClause = filterStatus
    ? and(
        inArray(video.workspaceId, workspaceIds),
        eq(video.sourceKind, 'manual_upload'),
        eq(video.transcribeStatus, filterStatus),
      )
    : and(
        inArray(video.workspaceId, workspaceIds),
        eq(video.sourceKind, 'manual_upload'),
      );

  const rows = await db
    .select({
      id: video.id,
      title: video.title,
      fileSizeBytes: video.fileSizeBytes,
      contentType: video.contentType,
      durationSeconds: video.durationSeconds,
      uploadStatus: video.uploadStatus,
      transcribeStatus: video.transcribeStatus,
      createdAt: video.createdAt,
    })
    .from(video)
    .where(whereClause)
    .orderBy(asc(video.createdAt));

  const uploads = rows.map((r) => ({
    id: r.id,
    title: r.title,
    fileSize: r.fileSizeBytes,
    contentType: r.contentType,
    durationSec: r.durationSeconds,
    uploadStatus: r.uploadStatus as UploadStatus | null,
    transcribeStatus: r.transcribeStatus as TranscribeStatus | null,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ uploads });
}
