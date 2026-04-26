'use client';

import { useCallback, useState } from 'react';

import { UploadDropzone } from './UploadDropzone';
import { UploadList } from './UploadList';
import type { UploadRow } from './UploadList';

export interface Props {
  workspaceId: string;
  initialRows: UploadRow[];
}

/**
 * Lifts upload list state above both UploadDropzone and UploadList so that
 * a completed upload immediately triggers a refresh of the list — without
 * waiting for the next poll cycle.
 *
 * This also ensures polling starts (or restarts) when a new upload appears
 * even if the list was previously empty/all-terminal.
 */
export function UploadsPanel({ workspaceId, initialRows }: Props) {
  const [rows, setRows] = useState<UploadRow[]>(initialRows);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/uploads?workspaceId=${encodeURIComponent(workspaceId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { uploads: UploadRow[] };
      setRows(data.uploads ?? []);
    } catch {
      // Ignore transient network errors; polling will catch up
    }
  }, [workspaceId]);

  return (
    <>
      <UploadDropzone
        workspaceId={workspaceId}
        onUploadCompleted={() => { void refresh(); }}
        onUploadFailed={() => { void refresh(); }}
      />
      <UploadList rows={rows} workspaceId={workspaceId} onRowsChange={setRows} />
    </>
  );
}
