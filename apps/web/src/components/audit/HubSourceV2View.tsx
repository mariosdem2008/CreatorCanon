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
}

export function HubSourceV2View({
  channelProfile,
  canonNodes,
  pageBriefs,
  debug,
}: {
  channelProfile: ChannelProfileView | null;
  canonNodes: CanonNodeView[];
  pageBriefs: PageBriefView[];
  debug: boolean;
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

  return (
    <div className="space-y-8">
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
              <CanonNodeCard key={n.id} node={n} debug={debug} />
            ))}
          </div>
        </section>
      ) : null}

      {/* READER JOURNEY */}
      {journeyNode ? (
        <section>
          <h2 className="text-[18px] font-semibold text-[var(--cc-ink)]">Reader journey</h2>
          <CanonNodeCard node={journeyNode} debug={debug} />
        </section>
      ) : null}

      {/* CANON NODES (the body teaching content) */}
      {standardNodes.length > 0 ? (
        <section>
          <h2 className="text-[18px] font-semibold text-[var(--cc-ink)]">
            Knowledge graph ({standardNodes.length} pages of teaching content)
          </h2>
          <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">
            Each canon node renders as a full hub page. The body is what your readers see.
          </p>
          <div className="mt-3 space-y-4">
            {standardNodes.map((n) => (
              <CanonNodeCard key={n.id} node={n} debug={debug} />
            ))}
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
              <BriefCard key={i} brief={b} debug={debug} />
            ))}
          </div>
        </section>
      ) : null}

      {/* DEBUG: channel profile internal/index */}
      {debug ? <ChannelProfileDebug profile={cp} /> : null}
    </div>
  );
}

function CanonNodeCard({ node, debug }: { node: CanonNodeView; debug: boolean }) {
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
          {p.body}
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

function BriefCard({ brief, debug }: { brief: PageBriefView; debug: boolean }) {
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
        <p className="mt-3 text-[13px] leading-[1.65] text-[var(--cc-ink-2)] whitespace-pre-wrap">{p.body}</p>
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
