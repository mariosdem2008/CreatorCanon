'use client';

import { useEffect, useState } from 'react';

/**
 * Shows a "something may be wrong" banner if no stage progress has happened
 * for `thresholdMs` after the run was queued. Hidden otherwise.
 *
 * Inputs:
 * - `runCreatedAtIso`: ISO string of when the run row was created. Used as
 *   the start-of-clock when no stages have started yet.
 * - `lastStageUpdateAtIso`: ISO string of the most recent
 *   `generation_stage_run.updated_at`. If no stages have started yet this
 *   is null — fall back to runCreatedAtIso.
 * - `runStatus`: 'queued' | 'running' — banner never shows for terminal
 *   states (the parent only mounts us for active runs anyway).
 * - `thresholdMs`: default 3 minutes.
 *
 * The component runs its own setInterval so it updates even when the
 * server component (parent page) isn't re-rendering — `LiveRefresh` runs
 * a 5 s router.refresh() loop, but the banner needs to flip on at the
 * 3-minute mark even if no server data has changed since the run was
 * created.
 */
export function StalledRunBanner({
  runCreatedAtIso,
  lastStageUpdateAtIso,
  runStatus,
  thresholdMs = 3 * 60 * 1000,
  supportMailto = 'mailto:support@creatorcanon.app?subject=Hub%20run%20stalled',
}: {
  runCreatedAtIso: string;
  lastStageUpdateAtIso: string | null;
  runStatus: 'queued' | 'running';
  thresholdMs?: number;
  supportMailto?: string;
}) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    function check() {
      const anchor = new Date(lastStageUpdateAtIso ?? runCreatedAtIso).getTime();
      const now = Date.now();
      setStalled(now - anchor > thresholdMs);
    }
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [runCreatedAtIso, lastStageUpdateAtIso, thresholdMs]);

  if (!stalled) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="border-b border-amber/40 bg-amber/8 px-4 py-3 sm:px-8"
    >
      <p className="text-sm font-semibold text-ink">
        This is taking longer than expected.
      </p>
      <p className="mt-1 text-sm text-ink-2">
        Your run has been {runStatus} for over 3 minutes without stage
        progress. Most runs finish in under 5 minutes. If it hasn&apos;t
        progressed in another few minutes,{' '}
        <a
          href={supportMailto}
          className="underline underline-offset-2 font-medium"
        >
          email support
        </a>{' '}
        and we&apos;ll look into it.
      </p>
    </div>
  );
}
