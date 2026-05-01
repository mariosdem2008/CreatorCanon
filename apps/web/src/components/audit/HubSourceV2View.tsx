/**
 * v2 Hub Source Document audit view.
 *
 * Renders ONLY rendered fields by default (hub_title, hub_tagline,
 * hero_candidates, canon node title/lede/body, brief title/hook/lede/body).
 *
 * `?debug=1` query param toggles operator mode — collapsible panels show
 * _internal_* and _index_* fields.
 *
 * Spec: docs/superpowers/specs/2026-05-01-hub-source-document-schema.md
 */

import type { ChannelProfileView, CanonNodeView, PageBriefView } from '@/lib/audit/types';
import { type EvidenceEntry, renderBodyWithChips } from '@/components/audit/EvidenceChip';
import { WorkshopStagesView, type WorkshopStage } from '@/components/audit/WorkshopStagesView';

interface ChannelProfileV2 {
  schemaVersion?: 'v2';
  creatorName?: string;
  hub_title?: string;
  hub_tagline?: string;
  hero_candidates?: string[];
  _internal_niche?: string;
  _internal_audience?: string;
  _internal_dominant_tone?: string;
  _internal_recurring_themes?: string[];
  _internal_recurring_promise?: string;
  _internal_monetization_angle?: string;
  _internal_positioning_summary?: string;
  _internal_why_people_follow?: string;
  _index_creator_terminology?: string[];
  _index_archetype?: string;
  _index_expertise_category?: string;
}

interface CanonV2 {
  schemaVersion?: 'v2';
  type?: string;
  origin?: string;
  kind?: string;
  title?: string;
  lede?: string;
  body?: string;
  _internal_summary?: string;
  _internal_why_it_matters?: string;
  _internal_when_to_use?: string | null;
  _internal_when_not_to_use?: string | null;
  _internal_common_mistake?: string | null;
  _internal_success_signal?: string | null;
  _index_evidence_segments?: string[];
  _index_supporting_examples?: string[];
  _index_supporting_stories?: string[];
  _index_supporting_mistakes?: string[];
  _index_cross_link_canon?: string[];
  /** Per-segment evidence registry — keyed by segment UUID. Added in Phase 7. */
  _index_evidence_registry?: Record<string, EvidenceEntry> | null;
  /** Populated only on reader_journey canon nodes. */
  _index_phases?: Array<{
    title?: string;
    hook?: string;
    body?: string;
    _internal_reader_state?: string;
    _internal_next_step_when?: string;
    _index_phase_number?: number;
    _index_primary_canon_node_ids?: string[];
    /** Per-phase evidence registry — keyed by segment UUID. Added in Phase 7. */
    _index_evidence_registry?: Record<string, EvidenceEntry> | null;
  }>;
}

interface BriefV2 {
  schemaVersion?: 'v2';
  pageId?: string;
  pageTitle?: string;
  hook?: string;
  lede?: string;
  body?: string;
  cta?: { primary?: string; secondary?: string };
  _internal_audience_question?: string;
  _internal_persona?: { name?: string; context?: string; objection?: string; proofThatHits?: string };
  _internal_journey_phase?: number;
  _internal_seo?: { primaryKeyword?: string; intent?: string; titleTemplate?: string; metaDescription?: string };
  _index_slug?: string;
  _index_page_type?: string;
  _index_primary_canon_node_ids?: string[];
  _index_supporting_canon_node_ids?: string[];
  _index_cluster_role?: { tier?: string; parent_topic?: string | null; sibling_slugs?: string[] };
  _index_voice_fingerprint?: { tonePreset?: string; preserveTerms?: string[]; profanityAllowed?: boolean };
  /** Per-segment evidence registry — keyed by segment UUID. Added in Phase 7. */
  _index_evidence_registry?: Record<string, EvidenceEntry> | null;
}

export function HubSourceV2View({
  channelProfile,
  canonNodes,
  pageBriefs,
  debug,
  segmentById,
  youtubeIdByVideoId,
  workshopStages = [],
}: {
  channelProfile: ChannelProfileView | null;
  canonNodes: CanonNodeView[];
  pageBriefs: PageBriefView[];
  debug: boolean;
  segmentById: Map<string, { videoId: string; startMs: number; text?: string }>;
  youtubeIdByVideoId: Record<string, string | null>;
  workshopStages?: Array<{ id: string; payload: Record<string, unknown>; position: number }>;
}) {
  const cp = channelProfile?.payload as ChannelProfileV2 | null;
  if (!cp) return null;

  const v2Canon = canonNodes.filter((n) => (n.payload as { schemaVersion?: string }).schemaVersion === 'v2');
  const v2Briefs = pageBriefs.filter((b) => (b.payload as { schemaVersion?: string }).schemaVersion === 'v2');

  // Bucket canon by tier (synthesis = pillar conceptual, others by pageWorthinessScore)
  const synthesisNodes = v2Canon.filter((n) => (n.payload as CanonV2).kind === 'synthesis');
  const journeyNode = v2Canon.find((n) => (n.payload as CanonV2).kind === 'reader_journey');
  const standardNodes = v2Canon
    .filter((n) => !(n.payload as CanonV2).kind || (n.payload as CanonV2).kind === undefined)
    .sort((a, b) => (b.pageWorthinessScore ?? 0) - (a.pageWorthinessScore ?? 0));

  // Group standard nodes by their pillar (synthesis) parent. Each synthesis
  // node's _index_cross_link_canon lists its children. Anything not claimed
  // by a pillar lands in the "Unanchored" bucket.
  const claimedByPillar = new Map<string, string[]>(); // synthesisId → [childIds]
  const childToPillar = new Map<string, string>();    // childId → synthesisId
  for (const s of synthesisNodes) {
    const ids = ((s.payload as CanonV2)._index_cross_link_canon ?? []).filter(Boolean) as string[];
    claimedByPillar.set(s.id, ids);
    for (const cid of ids) {
      if (!childToPillar.has(cid)) childToPillar.set(cid, s.id);
    }
  }
  const standardByPillar = new Map<string, CanonNodeView[]>();
  const unanchoredNodes: CanonNodeView[] = [];
  for (const n of standardNodes) {
    const pillarId = childToPillar.get(n.id);
    if (pillarId) {
      const arr = standardByPillar.get(pillarId) ?? [];
      arr.push(n);
      standardByPillar.set(pillarId, arr);
    } else {
      unanchoredNodes.push(n);
    }
  }

  // Completeness signals — drives the banner.
  const canonWithBodies = v2Canon.filter((n) => {
    const body = (n.payload as CanonV2).body;
    return typeof body === 'string' && body.length > 100;
  }).length;
  const journeyPhasesWithBody = journeyNode
    ? ((journeyNode.payload as CanonV2)._index_phases ?? []).filter(
        (p) => typeof p.body === 'string' && p.body.length > 50,
      ).length
    : 0;
  const totalJourneyPhases = journeyNode
    ? ((journeyNode.payload as CanonV2)._index_phases ?? []).length
    : 0;
  const briefsWithBody = v2Briefs.filter((b) => {
    const body = (b.payload as BriefV2).body;
    return typeof body === 'string' && body.length > 50;
  }).length;
  const heroOk = (cp.hero_candidates ?? []).filter((h) => h && h !== 'placeholder').length === 5;

  return (
    <div className="space-y-8">
      <CompletenessBanner
        canonTotal={v2Canon.length}
        canonWithBodies={canonWithBodies}
        synthesisCount={synthesisNodes.length}
        journeyPhasesWithBody={journeyPhasesWithBody}
        totalJourneyPhases={totalJourneyPhases}
        hasJourney={Boolean(journeyNode)}
        briefsTotal={v2Briefs.length}
        briefsWithBody={briefsWithBody}
        heroOk={heroOk}
      />
      {/* HERO SECTION — what a creator sees */}
      <section className="rounded-[12px] border border-[var(--cc-rule)] bg-gradient-to-br from-[var(--cc-surface)] to-[var(--cc-surface-2)] p-8 shadow-[var(--cc-shadow-1)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
          Hub homepage preview
        </p>
        {cp.hub_title ? (
          <h2 className="mt-2 text-[28px] font-bold leading-tight text-[var(--cc-ink)]">
            {cp.hub_title}
          </h2>
        ) : null}
        {cp.hub_tagline ? (
          <p className="mt-3 text-[15px] leading-[1.55] text-[var(--cc-ink-2)]">{cp.hub_tagline}</p>
        ) : null}
        {(cp.hero_candidates ?? []).length > 0 ? (
          <div className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
              5 hero hooks (pick one for your homepage)
            </p>
            <ul className="mt-3 space-y-2">
              {(cp.hero_candidates ?? []).map((h, i) => (
                <li
                  key={i}
                  className="rounded-[8px] border border-[var(--cc-rule)] bg-white p-3 text-[14px] leading-[1.45] text-[var(--cc-ink)]"
                >
                  <span className="mr-2 inline-block rounded-full bg-[var(--cc-accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--cc-accent-strong)]">
                    {['Pain', 'Aspiration', 'Contrarian', 'Number', 'Curiosity'][i] ?? `#${i + 1}`}
                  </span>
                  &ldquo;{h}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* SYNTHESIS / PILLAR PAGES */}
      {synthesisNodes.length > 0 ? (
        <section>
          <h2 className="text-[18px] font-semibold text-[var(--cc-ink)]">
            Pillar pages ({synthesisNodes.length})
          </h2>
          <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">
            Cross-cutting theses that anchor your hub. Each renders as a top-of-funnel page.
          </p>
          <div className="mt-3 space-y-4">
            {synthesisNodes.map((n) => (
              <CanonNodeCard key={n.id} node={n} debug={debug} segmentById={segmentById} youtubeIdByVideoId={youtubeIdByVideoId} />
            ))}
          </div>
        </section>
      ) : null}

      {/* READER JOURNEY (timeline) */}
      {journeyNode ? <ReaderJourneyTimeline node={journeyNode} debug={debug} segmentById={segmentById} youtubeIdByVideoId={youtubeIdByVideoId} /> : null}

      {/* WORKSHOP STAGES */}
      {workshopStages.length > 0 ? (
        <WorkshopStagesView
          stages={workshopStages.map((w) => w.payload as unknown as WorkshopStage)}
          segmentById={segmentById}
          youtubeIdByVideoId={youtubeIdByVideoId}
          debug={debug}
        />
      ) : null}

      {/* CANON NODES (the body teaching content) — grouped under their pillars */}
      {standardNodes.length > 0 ? (
        <section>
          <h2 className="text-[18px] font-semibold text-[var(--cc-ink)]">
            Knowledge graph ({standardNodes.length} pages of teaching content)
          </h2>
          <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">
            Each canon node renders as a full hub page. The body is what your readers see.
            {synthesisNodes.length > 0 ? ' Pages are grouped under the pillar they belong to.' : ''}
          </p>
          <div className="mt-3 space-y-6">
            {synthesisNodes.map((pillar) => {
              const spokes = standardByPillar.get(pillar.id) ?? [];
              if (spokes.length === 0) return null;
              const pp = pillar.payload as CanonV2;
              return (
                <div key={pillar.id} className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                    Pillar
                  </p>
                  <h3 className="mt-1 text-[16px] font-bold text-[var(--cc-ink)]">{pp.title}</h3>
                  <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
                    {spokes.length} spoke{spokes.length === 1 ? '' : 's'} below feed this pillar.
                  </p>
                  <div className="mt-3 space-y-3">
                    {spokes.map((n) => (
                      <CanonNodeCard key={n.id} node={n} debug={debug} segmentById={segmentById} youtubeIdByVideoId={youtubeIdByVideoId} />
                    ))}
                  </div>
                </div>
              );
            })}
            {unanchoredNodes.length > 0 ? (
              <div>
                {synthesisNodes.length > 0 ? (
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                    Standalone canon ({unanchoredNodes.length}) — not yet anchored to a pillar
                  </p>
                ) : null}
                <div className="space-y-3">
                  {unanchoredNodes.map((n) => (
                    <CanonNodeCard key={n.id} node={n} debug={debug} segmentById={segmentById} youtubeIdByVideoId={youtubeIdByVideoId} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* PAGE BRIEFS */}
      {v2Briefs.length > 0 ? (
        <section>
          <h2 className="text-[18px] font-semibold text-[var(--cc-ink)]">
            Page briefs ({v2Briefs.length})
          </h2>
          <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">
            How each canon node gets framed when it becomes a hub page.
          </p>
          <div className="mt-3 space-y-4">
            {v2Briefs.map((b, i) => (
              <BriefCard key={i} brief={b} debug={debug} segmentById={segmentById} youtubeIdByVideoId={youtubeIdByVideoId} />
            ))}
          </div>
        </section>
      ) : null}

      {/* DEBUG: channel profile internal/index */}
      {debug ? <ChannelProfileDebug profile={cp} /> : null}
    </div>
  );
}

function CanonNodeCard({
  node,
  debug,
  segmentById,
  youtubeIdByVideoId,
}: {
  node: CanonNodeView;
  debug: boolean;
  segmentById: Map<string, { videoId: string; startMs: number; text?: string }>;
  youtubeIdByVideoId: Record<string, string | null>;
}) {
  const p = node.payload as CanonV2;
  return (
    <article className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <header>
        {p.type ? (
          <span className="inline-block rounded-full bg-[var(--cc-accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--cc-accent-strong)]">
            {p.type}
            {p.kind ? ` · ${p.kind}` : ''}
          </span>
        ) : null}
        <h3 className="mt-2 text-[20px] font-bold leading-tight text-[var(--cc-ink)]">
          {p.title ?? '(Untitled)'}
        </h3>
        {p.lede ? (
          <p className="mt-2 text-[14px] leading-[1.55] text-[var(--cc-ink-2)]">{p.lede}</p>
        ) : null}
      </header>
      {p.body ? (
        <div className="prose prose-sm mt-4 max-w-none text-[14px] leading-[1.65] text-[var(--cc-ink-2)] whitespace-pre-wrap">
          {renderBodyWithChips({
            body: p.body,
            registry: p._index_evidence_registry ?? undefined,
            segmentById,
            youtubeIdByVideoId,
            debug,
          })}
        </div>
      ) : (
        <p className="mt-3 text-[12px] italic text-[var(--cc-ink-4)]">
          No body content yet.
        </p>
      )}
      {debug ? <CanonNodeDebug node={p} /> : null}
    </article>
  );
}

function CanonNodeDebug({ node }: { node: CanonV2 }) {
  return (
    <details className="mt-4 rounded-[8px] border border-dashed border-[var(--cc-rule)] bg-[var(--cc-surface-2)] p-3">
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
        Internal + indexing fields (operator only)
      </summary>
      <div className="mt-2 space-y-1 font-mono text-[11px] text-[var(--cc-ink-3)]">
        <div><strong>_internal_summary:</strong> {node._internal_summary}</div>
        <div><strong>_internal_why_it_matters:</strong> {node._internal_why_it_matters}</div>
        {node._internal_when_to_use ? <div><strong>_internal_when_to_use:</strong> {node._internal_when_to_use}</div> : null}
        {node._internal_common_mistake ? <div><strong>_internal_common_mistake:</strong> {node._internal_common_mistake}</div> : null}
        <div><strong>_index_evidence_segments:</strong> {(node._index_evidence_segments ?? []).length} segs</div>
        <div><strong>_index_supporting_examples:</strong> {(node._index_supporting_examples ?? []).join(', ') || '(none)'}</div>
        <div><strong>_index_supporting_stories:</strong> {(node._index_supporting_stories ?? []).join(', ') || '(none)'}</div>
        <div><strong>_index_supporting_mistakes:</strong> {(node._index_supporting_mistakes ?? []).join(', ') || '(none)'}</div>
        <div><strong>_index_cross_link_canon:</strong> {(node._index_cross_link_canon ?? []).join(', ') || '(none)'}</div>
      </div>
    </details>
  );
}

function BriefCard({
  brief,
  debug,
  segmentById,
  youtubeIdByVideoId,
}: {
  brief: PageBriefView;
  debug: boolean;
  segmentById: Map<string, { videoId: string; startMs: number; text?: string }>;
  youtubeIdByVideoId: Record<string, string | null>;
}) {
  const p = brief.payload as BriefV2;
  return (
    <article className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <header>
        {p._index_cluster_role?.tier ? (
          <span className="inline-block rounded-full bg-[var(--cc-accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--cc-accent-strong)]">
            {p._index_cluster_role.tier} · {p._index_page_type ?? '?'}
          </span>
        ) : null}
        <h3 className="mt-2 text-[18px] font-bold leading-tight text-[var(--cc-ink)]">
          {p.pageTitle ?? '(Untitled brief)'}
        </h3>
        {p.hook ? (
          <p className="mt-2 text-[14px] font-semibold leading-[1.45] text-[var(--cc-ink)]">{p.hook}</p>
        ) : null}
        {p.lede ? (
          <p className="mt-2 text-[13px] leading-[1.55] text-[var(--cc-ink-2)]">{p.lede}</p>
        ) : null}
      </header>
      {p.body ? (
        <div className="mt-3 text-[13px] leading-[1.65] text-[var(--cc-ink-2)] whitespace-pre-wrap">
          {renderBodyWithChips({
            body: p.body,
            registry: p._index_evidence_registry ?? undefined,
            segmentById,
            youtubeIdByVideoId,
            debug,
          })}
        </div>
      ) : null}
      {p.cta ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {p.cta.primary ? (
            <span className="rounded-[6px] bg-[var(--cc-accent-wash)]/40 px-2 py-1 text-[11px] text-[var(--cc-ink-2)]">
              CTA: {p.cta.primary}
            </span>
          ) : null}
          {p.cta.secondary ? (
            <span className="rounded-[6px] bg-[var(--cc-surface-2)] px-2 py-1 text-[11px] text-[var(--cc-ink-3)]">
              {p.cta.secondary}
            </span>
          ) : null}
        </div>
      ) : null}
      {debug ? <BriefDebug brief={p} /> : null}
    </article>
  );
}

function BriefDebug({ brief }: { brief: BriefV2 }) {
  return (
    <details className="mt-4 rounded-[8px] border border-dashed border-[var(--cc-rule)] bg-[var(--cc-surface-2)] p-3">
      <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
        Internal + indexing fields (operator only)
      </summary>
      <div className="mt-2 space-y-1 font-mono text-[11px] text-[var(--cc-ink-3)]">
        <div><strong>_internal_audience_question:</strong> {brief._internal_audience_question}</div>
        <div><strong>_internal_persona.name:</strong> {brief._internal_persona?.name}</div>
        <div><strong>_internal_persona.context:</strong> {brief._internal_persona?.context}</div>
        <div><strong>_internal_journey_phase:</strong> {brief._internal_journey_phase}</div>
        <div><strong>_internal_seo.primaryKeyword:</strong> {brief._internal_seo?.primaryKeyword}</div>
        <div><strong>_index_slug:</strong> {brief._index_slug}</div>
        <div><strong>_index_cluster_role:</strong> {JSON.stringify(brief._index_cluster_role)}</div>
        <div><strong>_index_voice_fingerprint.tonePreset:</strong> {brief._index_voice_fingerprint?.tonePreset}</div>
      </div>
    </details>
  );
}

function CompletenessBanner({
  canonTotal,
  canonWithBodies,
  synthesisCount,
  journeyPhasesWithBody,
  totalJourneyPhases,
  hasJourney,
  briefsTotal,
  briefsWithBody,
  heroOk,
}: {
  canonTotal: number;
  canonWithBodies: number;
  synthesisCount: number;
  journeyPhasesWithBody: number;
  totalJourneyPhases: number;
  hasJourney: boolean;
  briefsTotal: number;
  briefsWithBody: number;
  heroOk: boolean;
}) {
  const layers: Array<{ label: string; ok: boolean; detail: string }> = [
    {
      label: 'Hero',
      ok: heroOk,
      detail: heroOk ? '5 candidates ready' : 'Run --regen-hero',
    },
    {
      label: 'Canon bodies',
      ok: canonTotal > 0 && canonWithBodies === canonTotal,
      detail: `${canonWithBodies}/${canonTotal} with body`,
    },
    {
      label: 'Pillars',
      ok: synthesisCount >= 2,
      detail: synthesisCount > 0 ? `${synthesisCount} pillar${synthesisCount === 1 ? '' : 's'}` : 'Run --regen-synthesis',
    },
    {
      label: 'Reader journey',
      ok: hasJourney && journeyPhasesWithBody === totalJourneyPhases && totalJourneyPhases >= 3,
      detail: hasJourney ? `${journeyPhasesWithBody}/${totalJourneyPhases} phases` : 'Run --regen-journey',
    },
    {
      label: 'Page briefs',
      ok: briefsTotal > 0 && briefsWithBody === briefsTotal,
      detail: briefsTotal > 0 ? `${briefsWithBody}/${briefsTotal} with body` : 'Run --regen-briefs',
    },
  ];
  const okCount = layers.filter((l) => l.ok).length;
  const allOk = okCount === layers.length;

  return (
    <section
      className={`rounded-[12px] border p-4 shadow-[var(--cc-shadow-1)] ${
        allOk
          ? 'border-emerald-300/60 bg-emerald-50/60'
          : 'border-[var(--cc-rule)] bg-[var(--cc-surface)]'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
          Hub completeness
        </p>
        <p className="text-[11px] font-semibold text-[var(--cc-ink-3)] tabular-nums">
          {okCount} / {layers.length} layers ready
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {layers.map((l) => (
          <div
            key={l.label}
            className={`rounded-[8px] border p-2 text-[12px] ${
              l.ok
                ? 'border-emerald-300/60 bg-white'
                : 'border-amber-300/60 bg-amber-50/40'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  l.ok ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                aria-hidden
              />
              <span className="font-semibold text-[var(--cc-ink)]">{l.label}</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--cc-ink-3)]">{l.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReaderJourneyTimeline({
  node,
  debug,
  segmentById,
  youtubeIdByVideoId,
}: {
  node: CanonNodeView;
  debug: boolean;
  segmentById: Map<string, { videoId: string; startMs: number; text?: string }>;
  youtubeIdByVideoId: Record<string, string | null>;
}) {
  const p = node.payload as CanonV2;
  const phases = (p._index_phases ?? []).slice().sort((a, b) =>
    (a._index_phase_number ?? 0) - (b._index_phase_number ?? 0),
  );
  return (
    <section>
      <h2 className="text-[18px] font-semibold text-[var(--cc-ink)]">
        {p.title ?? 'Reader journey'}
      </h2>
      {p.lede ? (
        <p className="mt-1 text-[13px] leading-[1.55] text-[var(--cc-ink-2)]">{p.lede}</p>
      ) : null}
      {phases.length > 0 ? (
        <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {phases.map((phase, i) => (
            <li
              key={i}
              className="relative rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-4 shadow-[var(--cc-shadow-1)]"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--cc-accent)]/10 text-[11px] font-semibold text-[var(--cc-accent-strong)]">
                  {phase._index_phase_number ?? i + 1}
                </span>
                <h3 className="text-[14px] font-bold text-[var(--cc-ink)]">
                  {phase.title ?? `Phase ${i + 1}`}
                </h3>
              </div>
              {phase.hook ? (
                <p className="mt-2 text-[13px] font-semibold leading-[1.45] text-[var(--cc-ink)]">
                  &ldquo;{phase.hook}&rdquo;
                </p>
              ) : null}
              {phase.body ? (
                <div className="mt-2 text-[12px] leading-[1.6] text-[var(--cc-ink-2)] line-clamp-6 whitespace-pre-wrap">
                  {renderBodyWithChips({
                    body: phase.body,
                    registry: phase._index_evidence_registry ?? undefined,
                    segmentById,
                    youtubeIdByVideoId,
                    debug,
                  })}
                </div>
              ) : (
                <p className="mt-2 text-[11px] italic text-[var(--cc-ink-4)]">No phase body yet.</p>
              )}
              {debug ? (
                <details className="mt-3 rounded-[6px] border border-dashed border-[var(--cc-rule)] bg-[var(--cc-surface-2)] p-2">
                  <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
                    Phase planning fields
                  </summary>
                  <div className="mt-2 space-y-1 font-mono text-[10px] text-[var(--cc-ink-3)]">
                    <div><strong>_internal_reader_state:</strong> {phase._internal_reader_state}</div>
                    <div><strong>_internal_next_step_when:</strong> {phase._internal_next_step_when}</div>
                    <div><strong>_index_primary_canon_node_ids:</strong> {(phase._index_primary_canon_node_ids ?? []).join(', ')}</div>
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-[12px] italic text-[var(--cc-ink-4)]">
          The journey shell is present but no phases were generated. Run --regen-journey.
        </p>
      )}
      {debug ? (
        <details className="mt-3 rounded-[8px] border border-dashed border-[var(--cc-rule)] bg-[var(--cc-surface-2)] p-3">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
            Journey internal/index fields
          </summary>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-[var(--cc-ink-3)]">
            <div><strong>_internal_summary:</strong> {p._internal_summary}</div>
            <div><strong>_internal_why_it_matters:</strong> {p._internal_why_it_matters}</div>
            <div><strong>_index_cross_link_canon:</strong> {(p._index_cross_link_canon ?? []).join(', ') || '(none)'}</div>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function ChannelProfileDebug({ profile }: { profile: ChannelProfileV2 }) {
  return (
    <section className="rounded-[12px] border border-dashed border-[var(--cc-rule)] bg-[var(--cc-surface-2)] p-5">
      <h2 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
        Channel profile (operator debug)
      </h2>
      <div className="mt-3 space-y-2 text-[12px] text-[var(--cc-ink-2)]">
        <div><strong>creator:</strong> {profile.creatorName}</div>
        <div><strong>archetype:</strong> {profile._index_archetype}</div>
        <div><strong>_internal_niche:</strong> {profile._internal_niche}</div>
        <div><strong>_internal_audience:</strong> {profile._internal_audience}</div>
        <div><strong>_internal_dominant_tone:</strong> {profile._internal_dominant_tone}</div>
        <div><strong>_internal_recurring_themes:</strong> {(profile._internal_recurring_themes ?? []).join(' · ')}</div>
        <div><strong>_internal_recurring_promise:</strong> {profile._internal_recurring_promise}</div>
        <div><strong>_internal_monetization_angle:</strong> {profile._internal_monetization_angle}</div>
        <div><strong>_index_creator_terminology:</strong> {(profile._index_creator_terminology ?? []).join(', ')}</div>
      </div>
    </section>
  );
}
