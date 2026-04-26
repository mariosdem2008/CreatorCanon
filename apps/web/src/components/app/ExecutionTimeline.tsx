type Stage = {
  id: string;
  stageName: string;
  status: string;
  durationMs: number | null;
  errorJson?: { message?: string } | null;
};

const stageLabels: Record<string, string> = {
  import_selection_snapshot: 'Import selection',
  ensure_transcripts: 'Fetch transcripts',
  normalize_transcripts: 'Normalize transcripts',
  segment_transcripts: 'Segment transcripts',
  discovery: 'Discovery',
  synthesis: 'Synthesis',
  verify: 'Verify',
  merge: 'Merge',
  adapt: 'Adapt to template',
  extract_text_atoms: 'Extract knowledge atoms',
  cluster_archive: 'Cluster topics',
  build_outline: 'Build outline',
  qa_and_repair: 'QA and repair',
  index_chat: 'Index for chat',
  build_release: 'Build release',
};

export function ExecutionTimeline({ stages }: { stages: Stage[] }) {
  if (stages.length === 0) {
    return (
      <div className="rounded-[var(--r-md)] border border-[var(--rule)] bg-[var(--paper)] px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
          <p className="text-[13px] text-[var(--ink-3)]">
            Waiting for the worker to write its first pipeline stage.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ol className="overflow-hidden rounded-[var(--r-md)] border border-[var(--rule)] bg-[var(--paper)]">
      {stages.map((stage, index) => (
        <li
          key={stage.id}
          className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 border-b border-[var(--rule)] px-4 py-4 last:border-b-0 sm:px-5"
        >
          <div className="relative flex justify-center">
            {index < stages.length - 1 ? (
              <span className="absolute top-5 h-[calc(100%+16px)] w-px bg-[var(--rule)]" />
            ) : null}
            <span className={`relative mt-1 h-3 w-3 rounded-full ${statusDot(stage.status)}`} />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[var(--ink)]">
              {stageLabels[stage.stageName] ?? stage.stageName.replaceAll('_', ' ')}
            </p>
            {stage.errorJson?.message ? (
              <p className="mt-1 text-[12px] leading-5 text-[var(--rose)]">{stage.errorJson.message}</p>
            ) : (
              <p className="mt-1 text-[12px] text-[var(--ink-4)]">{stage.status.replaceAll('_', ' ')}</p>
            )}
          </div>
          <div className="pt-0.5 text-right font-mono text-[11px] text-[var(--ink-4)]">
            {stage.durationMs ? `${(stage.durationMs / 1000).toFixed(1)}s` : statusShort(stage.status)}
          </div>
        </li>
      ))}
    </ol>
  );
}

function statusDot(status: string): string {
  if (status === 'succeeded') return 'bg-[var(--sage)]';
  if (status === 'running') return 'bg-[var(--amber)] animate-pulse';
  if (status.startsWith('failed')) return 'bg-[var(--rose)]';
  if (status === 'skipped') return 'bg-[var(--ink-5)]';
  return 'bg-[var(--paper-3)] ring-1 ring-[var(--rule-strong)]';
}

function statusShort(status: string): string {
  if (status === 'succeeded') return 'done';
  if (status === 'running') return 'now';
  if (status.startsWith('failed')) return 'fail';
  return status.slice(0, 7);
}
