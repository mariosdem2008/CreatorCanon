'use client';

export interface WorkshopClip {
  id: string;
  segmentId: string;
  title: string;
  instruction: string;
  brief: string;
  action: string;
  startSeconds?: number;
  endSeconds?: number;
  _index_relevance_score: number;
  _index_confidence: 'high' | 'medium';
  _index_why_this_clip_teaches_this_step: string;
  _index_related_canon_node_ids: string[];
}

export interface WorkshopStage {
  id: string;
  slug: string;
  route: string;
  order: number;
  eyebrow: string;
  title: string;
  promise: string;
  brief: string;
  outcome: string;
  clips: WorkshopClip[];
  _index_related_node_ids: string[];
  _index_source_phase_number: number;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function WorkshopStagesView({
  stages,
  segmentById,
  youtubeIdByVideoId,
  debug,
}: {
  stages: WorkshopStage[];
  segmentById: Map<string, { videoId: string; startMs: number; text?: string }>;
  youtubeIdByVideoId: Record<string, string | null>;
  debug: boolean;
}) {
  if (stages.length === 0) return null;
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const totalClips = sorted.reduce((acc, s) => acc + s.clips.length, 0);

  return (
    <section>
      <h2 className="text-[18px] font-semibold text-[var(--cc-ink)]">
        Workshop ({sorted.length} stage{sorted.length === 1 ? '' : 's'}, {totalClips} clip{totalClips === 1 ? '' : 's'})
      </h2>
      <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">
        Guided reading path with timestamped clips. One stage per reader journey phase.
      </p>
      <ol className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((stage) => (
          <WorkshopStageCard
            key={stage.id}
            stage={stage}
            segmentById={segmentById}
            youtubeIdByVideoId={youtubeIdByVideoId}
            debug={debug}
          />
        ))}
      </ol>
    </section>
  );
}

function WorkshopStageCard({
  stage,
  segmentById,
  youtubeIdByVideoId,
  debug,
}: {
  stage: WorkshopStage;
  segmentById: Map<string, { videoId: string; startMs: number; text?: string }>;
  youtubeIdByVideoId: Record<string, string | null>;
  debug: boolean;
}) {
  return (
    <li className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-4 shadow-[var(--cc-shadow-1)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
        {stage.eyebrow}
      </p>
      <h3 className="mt-1 text-[15px] font-bold text-[var(--cc-ink)]">{stage.title}</h3>
      <p className="mt-2 text-[13px] font-semibold leading-[1.45] text-[var(--cc-ink)]">
        &ldquo;{stage.promise}&rdquo;
      </p>
      <p className="mt-2 text-[12px] leading-[1.6] text-[var(--cc-ink-2)]">{stage.brief}</p>
      <p className="mt-2 text-[12px] italic text-[var(--cc-ink-3)]">
        Outcome: {stage.outcome}
      </p>
      <details className="mt-3 rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)] p-2">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-3)]">
          {stage.clips.length} clip{stage.clips.length === 1 ? '' : 's'}
        </summary>
        <div className="mt-2 space-y-3">
          {stage.clips.map((clip) => (
            <WorkshopClipRow
              key={clip.id}
              clip={clip}
              segmentById={segmentById}
              youtubeIdByVideoId={youtubeIdByVideoId}
              debug={debug}
            />
          ))}
        </div>
      </details>
      {debug ? (
        <details className="mt-3 rounded-[6px] border border-dashed border-[var(--cc-rule)] bg-[var(--cc-surface-2)] p-2">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
            Operator detail
          </summary>
          <div className="mt-1 space-y-1 font-mono text-[10px] text-[var(--cc-ink-3)]">
            <p><strong>id:</strong> {stage.id}</p>
            <p><strong>slug:</strong> {stage.slug}</p>
            <p><strong>route:</strong> {stage.route}</p>
            <p><strong>order:</strong> {stage.order}</p>
            <p><strong>_index_source_phase_number:</strong> {stage._index_source_phase_number}</p>
            <p><strong>_index_related_node_ids:</strong> {stage._index_related_node_ids.join(', ')}</p>
          </div>
        </details>
      ) : null}
    </li>
  );
}

function WorkshopClipRow({
  clip,
  segmentById,
  youtubeIdByVideoId,
  debug,
}: {
  clip: WorkshopClip;
  segmentById: Map<string, { videoId: string; startMs: number; text?: string }>;
  youtubeIdByVideoId: Record<string, string | null>;
  debug: boolean;
}) {
  const seg = segmentById.get(clip.segmentId);
  const start = clip.startSeconds ?? (seg ? seg.startMs / 1000 : 0);
  const end = clip.endSeconds ?? (seg ? seg.startMs / 1000 + 60 : 60);
  const duration = Math.round(end - start);
  const youtubeId = seg ? youtubeIdByVideoId[seg.videoId] : null;
  const youtubeUrl = youtubeId ? `https://youtube.com/watch?v=${youtubeId}&t=${Math.floor(start)}s` : null;

  return (
    <div className="rounded-[6px] border border-[var(--cc-rule)] bg-white p-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold text-[var(--cc-ink)]">{clip.title}</p>
        <span className="shrink-0 rounded-full bg-[var(--cc-surface-2)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--cc-ink-3)]">
          {formatTime(start)}–{formatTime(end)} ({duration}s)
        </span>
      </div>
      <p className="mt-1 text-[12px] font-semibold text-[var(--cc-ink-2)]">{clip.instruction}</p>
      <p className="mt-1 text-[11px] leading-[1.5] text-[var(--cc-ink-3)]">{clip.brief}</p>
      <p className="mt-1 text-[11px] font-mono text-[var(--cc-ink-2)]">&rarr; {clip.action}</p>
      {youtubeUrl ? (
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-[11px] font-semibold text-[var(--cc-accent)] hover:underline"
        >
          Watch the clip &#x2197;
        </a>
      ) : null}
      {debug ? (
        <div className="mt-2 space-y-1 rounded border border-dashed border-[var(--cc-rule)] p-1 font-mono text-[10px] text-[var(--cc-ink-3)]">
          <p><strong>relevance:</strong> {clip._index_relevance_score} ({clip._index_confidence})</p>
          <p><strong>why:</strong> {clip._index_why_this_clip_teaches_this_step}</p>
          <p><strong>relatedCanon:</strong> {clip._index_related_canon_node_ids.join(', ')}</p>
        </div>
      ) : null}
    </div>
  );
}
