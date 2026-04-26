'use client';

import { useEffect, useRef, useState } from 'react';

import { UploadStatusBadge } from './UploadStatusBadge';

export interface UploadRow {
  id: string;
  title: string | null;
  fileSize: number | null;
  contentType: string | null;
  durationSec: number | null;
  uploadStatus: 'uploading' | 'uploaded' | 'failed' | null;
  transcribeStatus: 'pending' | 'transcribing' | 'ready' | 'failed' | null;
  createdAt: string;
}

export interface Props {
  rows: UploadRow[];
  onRowsChange: (rows: UploadRow[]) => void;
  workspaceId: string;
}

type ApiResponse = {
  uploads: UploadRow[];
};

function isTerminal(row: UploadRow): boolean {
  return (
    (row.transcribeStatus === 'ready' || row.transcribeStatus === 'failed') &&
    row.uploadStatus !== 'uploading'
  );
}

function allTerminal(rows: UploadRow[]): boolean {
  return rows.every(isTerminal);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function UploadList({ rows, onRowsChange, workspaceId }: Props) {
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a ref in sync with latest rows so the interval body can read them
  // without being included in the interval's dep array.
  const rowsRef = useRef(rows);

  // Sync rowsRef to the latest rows on every render.
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Start polling once when workspaceId is established.
  // The interval body reads rowsRef to get the latest state without
  // causing the interval to be torn down and recreated on each poll response.
  useEffect(() => {
    pollingRef.current = setInterval(async () => {
      if (allTerminal(rowsRef.current)) return; // self-quiesce when all terminal
      try {
        const res = await fetch(`/api/uploads?workspaceId=${encodeURIComponent(workspaceId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as ApiResponse;
        onRowsChange(data.uploads);
      } catch {
        // Silently ignore transient network errors; will retry on next tick
      }
    }, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Stop polling as soon as all rows reach a terminal state.
  useEffect(() => {
    if (allTerminal(rows) && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [rows]);

  async function handleDelete(id: string) {
    setDeletingIds((prev) => new Set([...prev, id]));
    try {
      const res = await fetch(`/api/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) {
        onRowsChange(rowsRef.current.filter((r) => r.id !== id));
      }
    } catch {
      // Silently ignore; user can retry
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="border-t border-[var(--cc-rule)] px-4 py-10 text-center">
        <p className="text-[14px] font-semibold text-[var(--cc-ink)]">No uploads yet</p>
        <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">
          Drop a video or audio file above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--cc-rule)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/60 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
          Uploaded files
        </p>
        <span className="text-[11px] text-[var(--cc-ink-4)] tabular-nums">{rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="bg-[var(--cc-surface-2)]/40">
            <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
              <th className="px-4 py-2.5 font-semibold">File</th>
              <th className="px-2 py-2.5 font-semibold">Size</th>
              <th className="px-2 py-2.5 font-semibold">Duration</th>
              <th className="px-2 py-2.5 font-semibold">Status</th>
              <th className="px-2 py-2.5 font-semibold">Added</th>
              <th className="px-2 py-2.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isDeleting = deletingIds.has(row.id);
              return (
                <tr
                  key={row.id}
                  className="border-t border-[var(--cc-rule)] transition-colors hover:bg-[var(--cc-surface-2)]/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-[200px]">
                      <FileIcon contentType={row.contentType} />
                      <span className="min-w-0 truncate font-medium text-[var(--cc-ink)]">
                        {row.title ?? '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-[var(--cc-ink-3)] tabular-nums whitespace-nowrap">
                    {row.fileSize ? formatBytes(row.fileSize) : '—'}
                  </td>
                  <td className="px-2 py-3 text-[var(--cc-ink-3)] tabular-nums whitespace-nowrap">
                    {row.durationSec ? formatDuration(row.durationSec) : '—'}
                  </td>
                  <td className="px-2 py-3">
                    <UploadStatusBadge
                      uploadStatus={row.uploadStatus}
                      transcribeStatus={row.transcribeStatus}
                    />
                  </td>
                  <td className="px-2 py-3 text-[var(--cc-ink-3)] whitespace-nowrap text-[12px]">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => handleDelete(row.id)}
                      className="rounded-[6px] px-2 py-1 text-[11px] font-semibold text-[var(--cc-ink-4)] transition-colors hover:bg-[var(--cc-danger-wash)] hover:text-[var(--cc-danger)] disabled:opacity-40"
                      aria-label={`Delete ${row.title ?? 'upload'}`}
                    >
                      {isDeleting ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FileIcon({ contentType }: { contentType: string | null }) {
  const isVideo = contentType?.startsWith('video/');
  return (
    <span className="shrink-0 inline-flex size-7 items-center justify-center rounded-[6px] bg-[var(--cc-surface-2)] text-[var(--cc-ink-4)]">
      {isVideo ? (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5" aria-hidden>
          <rect x="1" y="3" width="14" height="10" rx="1.5" />
          <path d="M6 6l4 2-4 2V6z" fill="currentColor" stroke="none" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-3.5" aria-hidden>
          <rect x="2" y="1" width="12" height="14" rx="1.5" />
          <path d="M5 7h6M5 9.5h4" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
