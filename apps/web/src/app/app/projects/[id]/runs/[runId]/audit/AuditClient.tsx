'use client';

import { useState, useTransition } from 'react';

import { approveAuditAndStartHubBuild, discardRun, getAuditMarkdown, getHubSourceDocument } from './actions';

export function AuditActions({
  runId,
  projectId,
  isReady,
  schemaVersion,
}: {
  runId: string;
  projectId: string;
  isReady: boolean;
  /** 'v2' = Hub Source Document JSON; otherwise legacy markdown */
  schemaVersion: 'v2' | 'v1-legacy';
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');

  async function handleCopy() {
    setCopyState('copying');
    try {
      const text = schemaVersion === 'v2'
        ? await getHubSourceDocument(runId)
        : await getAuditMarkdown(runId);
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (err) {
      console.error('copy audit failed', err);
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 3000);
    }
  }

  const copyLabel = schemaVersion === 'v2' ? 'Copy Hub Source' : 'Copy audit';

  return (
    <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-4 shadow-[var(--cc-shadow-2)] sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[13px] text-[var(--cc-ink-2)]">
        {isReady
          ? 'Audit complete. Generate the hub when you’re happy with the plan, or discard to start over.'
          : 'Audit is still running…'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={copyState === 'copying'}
          className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)] disabled:opacity-50"
        >
          {copyState === 'copying'
            ? 'Copying…'
            : copyState === 'copied'
              ? 'Copied!'
              : copyState === 'error'
                ? 'Copy failed'
                : copyLabel}
        </button>
        {!confirmDiscard ? (
          <button
            type="button"
            disabled={isPending || !isReady}
            onClick={() => setConfirmDiscard(true)}
            className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)] disabled:opacity-50"
          >
            Discard
          </button>
        ) : (
          <form
            action={(fd: FormData) => {
              startTransition(() => {
                void discardRun(fd);
              });
            }}
          >
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="projectId" value={projectId} />
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-danger)]/40 bg-[var(--cc-danger-wash)]/40 px-3 text-[12px] font-semibold text-[var(--cc-danger)] hover:border-[var(--cc-danger)]/60 disabled:opacity-50"
            >
              Confirm discard
            </button>
          </form>
        )}
        <form
          action={(fd: FormData) => {
            startTransition(() => {
              void approveAuditAndStartHubBuild(fd);
            });
          }}
        >
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="projectId" value={projectId} />
          <button
            type="submit"
            disabled={isPending || !isReady}
            className="inline-flex h-9 items-center rounded-[8px] bg-[var(--cc-accent)] px-3 text-[12px] font-semibold text-white hover:bg-[var(--cc-accent-strong)] disabled:opacity-50"
          >
            {isPending ? 'Starting…' : 'Generate Hub'}
          </button>
        </form>
      </div>
    </div>
  );
}
