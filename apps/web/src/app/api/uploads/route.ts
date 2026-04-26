import { NextResponse } from 'next/server';
import { auth } from '@creatorcanon/auth';
import { and, asc, eq, getDb } from '@creatorcanon/db';
import { workspaceMember, video } from '@creatorcanon/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type UploadStatus = 'uploading' | 'uploaded' | 'failed';
type TranscribeStatus = 'pending' | 'transcribing' | 'ready' | 'failed';

// Status values accepted in ?status= query param
const VALID_TRANSCRIBE_STATUSES = new Set<string>(['ready', 'transcribing', 'failed']);

export async function GET(req: Request) {
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

  // 3. Optional ?status= filter
  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const filterStatus: TranscribeStatus | null =
    statusParam && VALID_TRANSCRIBE_STATUSES.has(statusParam)
      ? (statusParam as TranscribeStatus)
      : null;

  // 4. Query videos
  const whereClause = filterStatus
    ? and(
        eq(video.workspaceId, workspaceId),
        eq(video.sourceKind, 'manual_upload'),
        eq(video.transcribeStatus, filterStatus),
      )
    : and(eq(video.workspaceId, workspaceId), eq(video.sourceKind, 'manual_upload'));

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
