'use client';

import { useCallback, useRef, useState } from 'react';

import {
  isAllowedContentType,
  isAllowedFileSize,
  MAX_FILE_BYTES,
} from '@/lib/uploads/contentTypes';

export interface Props {
  workspaceId: string;
  onUploadStarted?: (videoId: string) => void;
  onUploadCompleted?: (videoId: string) => void;
  onUploadFailed?: (filename: string, error: string) => void;
}

type UploadState = 'queued' | 'uploading' | 'completing' | 'done' | 'failed';

interface InFlightUpload {
  id: string; // local UUID for tracking before videoId is known
  filename: string;
  fileSize: number;
  progress: number; // 0–100
  state: UploadState;
  videoId?: string;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function ProgressBar({ progress }: { progress: number }) {
  const filled = Math.round(progress / 10);
  const empty = 10 - filled;
  return (
    <span className="font-mono text-[12px] text-[var(--cc-ink-4)]" aria-hidden>
      [{Array(filled).fill('█').join('')}{Array(empty).fill('░').join('')}] {progress}%
    </span>
  );
}

export function UploadDropzone({
  workspaceId,
  onUploadStarted,
  onUploadCompleted,
  onUploadFailed,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<InFlightUpload[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function addError(msg: string) {
    setErrors((prev) => [...prev, msg]);
  }

  function updateUpload(localId: string, patch: Partial<InFlightUpload>) {
    setUploads((prev) =>
      prev.map((u) => (u.id === localId ? { ...u, ...patch } : u)),
    );
  }

  const processFile = useCallback(
    async (file: File) => {
      // 1. Client-side validation
      if (!isAllowedContentType(file.type)) {
        const msg = `"${file.name}": unsupported type (${file.type || 'unknown'}). Allowed: mp4, webm, mov, mkv, mp3, wav, m4a.`;
        addError(msg);
        onUploadFailed?.(file.name, msg);
        return;
      }
      if (!isAllowedFileSize(file.size)) {
        const msg =
          file.size === 0
            ? `"${file.name}": file is empty.`
            : `"${file.name}": file exceeds the 2 GB limit (${formatBytes(file.size)}).`;
        addError(msg);
        onUploadFailed?.(file.name, msg);
        return;
      }

      // 2. Register in-flight entry
      const localId = crypto.randomUUID();
      const entry: InFlightUpload = {
        id: localId,
        filename: file.name,
        fileSize: file.size,
        progress: 0,
        state: 'queued',
      };
      setUploads((prev) => [...prev, entry]);

      // 3. POST /api/upload/init
      let videoId: string;
      let uploadUrl: string;
      try {
        updateUpload(localId, { state: 'uploading' });
        const initRes = await fetch('/api/upload/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            fileSize: file.size,
            contentType: file.type,
            workspaceId,
          }),
        });
        if (!initRes.ok) {
          const data = await initRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `Init failed (${initRes.status})`);
        }
        const initData = await initRes.json() as { videoId: string; uploadUrl: string };
        videoId = initData.videoId;
        uploadUrl = initData.uploadUrl;
        updateUpload(localId, { videoId });
        onUploadStarted?.(videoId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload init failed';
        updateUpload(localId, { state: 'failed', error: msg });
        onUploadFailed?.(file.name, msg);
        return;
      }

      // 4. PUT file via XHR (for progress events)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            updateUpload(localId, { progress: pct });
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200 || xhr.status === 204) {
            updateUpload(localId, { progress: 100 });
            resolve();
          } else {
            reject(new Error(`PUT failed (${xhr.status})`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

        xhr.send(file);
      }).catch((err) => {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        updateUpload(localId, { state: 'failed', error: msg });
        onUploadFailed?.(file.name, msg);
        // Re-throw to prevent /complete call
        throw err;
      });

      // 5. POST /api/upload/complete
      try {
        updateUpload(localId, { state: 'completing' });
        const completeRes = await fetch('/api/upload/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId }),
        });
        if (!completeRes.ok) {
          const data = await completeRes.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `Complete failed (${completeRes.status})`);
        }
        updateUpload(localId, { state: 'done' });
        onUploadCompleted?.(videoId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload completion failed';
        updateUpload(localId, { state: 'failed', error: msg });
        onUploadFailed?.(file.name, msg);
      }
    },
    [workspaceId, onUploadStarted, onUploadCompleted, onUploadFailed],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      // Reset BEFORE processing so onChange fires for re-selection of same file.
      if (inputRef.current) inputRef.current.value = '';
      for (const file of Array.from(files)) {
        processFile(file).catch(() => {
          // errors already handled inside processFile
        });
      }
    },
    [processFile],
  );

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    // Guard against child-element transitions: only clear dragging when the
    // pointer genuinely leaves the drop zone boundary (not just moves between
    // child elements), which avoids the "flicker" caused by relatedTarget
    // briefly pointing to an interior child.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  }

  function stateLabel(u: InFlightUpload): string {
    switch (u.state) {
      case 'queued':     return 'queued';
      case 'uploading':  return 'uploading';
      case 'completing': return 'processing';
      case 'done':       return 'done';
      case 'failed':     return 'failed';
    }
  }

  const hasInFlight = uploads.some(
    (u) => u.state === 'queued' || u.state === 'uploading' || u.state === 'completing',
  );

  return (
    <div className="p-4 space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        aria-label="Drop video or audio files here, or press Enter to choose files"
        className={[
          'flex flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer select-none',
          dragging
            ? 'border-[var(--cc-accent)] bg-[var(--cc-accent-wash)]/30'
            : 'border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 hover:border-[var(--cc-ink-4)]',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="size-8 text-[var(--cc-ink-4)]"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-[14px] font-semibold text-[var(--cc-ink)]">
          Drop videos here, or click to choose
        </p>
        <p className="text-[12px] text-[var(--cc-ink-4)]">
          MP4, WebM, MOV, MKV, MP3, WAV, M4A · max 2 GB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="video/mp4,video/webm,video/quicktime,video/x-matroska,audio/mpeg,audio/wav,audio/mp4"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          aria-hidden
          tabIndex={-1}
        />
      </div>

      {/* Validation errors */}
      {errors.length > 0 ? (
        <ul className="space-y-1">
          {errors.map((err, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-[8px] bg-[var(--cc-danger-wash)] px-3 py-2 text-[12px] text-[var(--cc-danger)]"
            >
              <span aria-hidden className="mt-px shrink-0">✕</span>
              <span>{err}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* In-flight list */}
      {uploads.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--cc-ink-4)]">
            {hasInFlight ? 'In progress' : 'Completed'}
          </p>
          <ul className="space-y-2">
            {uploads.map((u) => (
              <li
                key={u.id}
                className="flex flex-col gap-1 rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] font-medium text-[var(--cc-ink)]">
                    {u.filename}
                  </span>
                  <span
                    className={[
                      'shrink-0 text-[11px] font-semibold',
                      u.state === 'done'
                        ? 'text-[var(--cc-success)]'
                        : u.state === 'failed'
                          ? 'text-[var(--cc-danger)]'
                          : 'text-[var(--cc-ink-4)]',
                    ].join(' ')}
                  >
                    {stateLabel(u)}
                  </span>
                </div>
                {u.state !== 'done' && u.state !== 'failed' ? (
                  <ProgressBar progress={u.progress} />
                ) : null}
                {u.error ? (
                  <p className="text-[11px] text-[var(--cc-danger)]">{u.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
