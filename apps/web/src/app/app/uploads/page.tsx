import { and, desc, eq } from '@creatorcanon/db';
import { video } from '@creatorcanon/db/schema';

import { LinkButton, PageHeader, Panel } from '@/components/cc';
import { UploadsPanel } from '@/components/uploads/UploadsPanel';
import type { UploadRow } from '@/components/uploads/UploadList';
import { requireWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Uploads' };

export default async function UploadsPage() {
  const { db, workspaceId } = await requireWorkspace();

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
    .where(and(eq(video.workspaceId, workspaceId), eq(video.sourceKind, 'manual_upload')))
    .orderBy(desc(video.createdAt));

  const rowsForClient: UploadRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    fileSize: r.fileSizeBytes,
    contentType: r.contentType,
    durationSec: r.durationSeconds,
    uploadStatus: r.uploadStatus as UploadRow['uploadStatus'],
    transcribeStatus: r.transcribeStatus as UploadRow['transcribeStatus'],
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Content"
        title="Upload videos"
        body="Upload your own videos or audio files for transcription and use in projects."
        actions={
          <LinkButton href="/app/library" variant="secondary" size="sm">
            ← Back to library
          </LinkButton>
        }
      />
      <Panel>
        <UploadsPanel workspaceId={workspaceId} initialRows={rowsForClient} />
      </Panel>
    </div>
  );
}
