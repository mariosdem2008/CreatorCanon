import { eq, inArray } from '@creatorcanon/db';
import { page, pageVersion, segment } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';
import type { ProjectedTopic } from './project-topics';
import { enrichQuoteSection, type SectionLike } from './quote-enrichment';
import { titleCase } from './title-case';

interface AtlasMeta {
  evidenceQuality: 'strong' | 'moderate' | 'limited' | 'unverified';
  citationCount: number;
  sourceCoveragePercent: number;
  relatedPageIds: string[];
  hero?: { illustrationKey: string };
  evidenceSegmentIds: string[];
  primaryFindingId: string;
  supportingFindingIds: string[];
}

function coerceEvidenceQuality(
  q: AtlasMeta['evidenceQuality'],
): 'strong' | 'moderate' | 'limited' {
  if (q === 'strong') return 'strong';
  if (q === 'moderate') return 'moderate';
  return 'limited'; // 'limited' OR 'unverified' both map to 'limited'
}

/**
 * Manifest pageSchema accepts only lesson | framework | playbook. canon_v1's
 * page-type vocabulary is wider (topic_overview / about / hub_home / etc.).
 * Map narrowing — pick the closest renderable neighbour rather than letting
 * Zod reject the whole manifest.
 */
function mapDbPageTypeToManifest(pt: string): 'lesson' | 'framework' | 'playbook' {
  if (pt === 'framework') return 'framework';
  if (pt === 'playbook') return 'playbook';
  // lesson, topic_overview, about, hub_home, definition, principle → lesson
  return 'lesson';
}

/**
 * Translate a composer block (intro / section / framework / callout / quote /
 * list / visual_example) into a manifest section (overview / paragraph / steps /
 * callout / quote / principles / ...). The composer was rewritten in the
 * canon_v1 redesign to match the page_writer prompt vocabulary; the manifest
 * schema is still on the older Editorial Atlas vocabulary. This boundary
 * translates between them so the renderer never sees a discriminator it
 * doesn't recognise.
 */
function mapComposerBlockToRendererSection(
  type: string,
  content: Record<string, unknown>,
  citations: string[],
): Record<string, unknown> {
  const citationIds = citations;
  const body = (content.body as string | undefined) ?? '';
  const heading = (content.heading as string | undefined) ?? '';
  const titleField = (content.title as string | undefined) ?? '';

  switch (type) {
    case 'intro':
      // Composer's `intro` is the page's lead paragraph — renderer's `overview`.
      return { kind: 'overview', body: body || titleField || 'Overview', citationIds };

    case 'section': {
      // Composer's `section` is a generic prose section with optional heading.
      // The Editorial Atlas renderer doesn't have a "section" — `paragraph`
      // is the closest fit (paragraph schema only takes body, no title).
      const merged = heading ? `**${heading}**\n\n${body}` : body;
      return { kind: 'paragraph', body: merged || 'See the source material for more.', citationIds };
    }

    case 'framework': {
      // Composer's framework: { title, steps: [{label, detail, citationIds}] }
      // Renderer's steps: { kind, title, items: [{title, body}] }
      const steps = Array.isArray(content.steps) ? (content.steps as Array<{ label?: string; detail?: string }>) : [];
      const items = steps
        .map((s, i) => ({
          title: s.label?.trim() || `Step ${i + 1}`,
          body: s.detail?.trim() || '',
        }))
        .filter((it) => it.body.length > 0);
      if (items.length === 0) {
        // Empty framework → degrade to paragraph so we don't fail steps.min(1).
        return { kind: 'paragraph', body: body || titleField || 'See the source material for more.', citationIds };
      }
      return {
        kind: 'steps',
        title: titleField || 'Steps',
        items,
        citationIds,
      };
    }

    case 'callout': {
      // Composer tones: tip | warning | definition | example | (visual_example default 'note')
      // Renderer tones: note | warn | success
      const composerTone = (content.tone as string | undefined) ?? 'note';
      const rendererTone =
        composerTone === 'warning' ? 'warn' :
        composerTone === 'tip' || composerTone === 'definition' ? 'note' :
        composerTone === 'example' || composerTone === 'success' ? 'success' :
        'note';
      return {
        kind: 'callout',
        tone: rendererTone,
        body: body || titleField || 'Note',
        citationIds,
      };
    }

    case 'quote':
      return {
        kind: 'quote',
        // Composer stores the quote text under `text`; renderer expects `body`.
        body: ((content.text as string | undefined) ?? body ?? '').trim() || 'Quote unavailable.',
        attribution: content.attribution as string | undefined,
        citationIds,
      };

    case 'list': {
      // Composer list: { title, items: [{label, detail, citationIds}] }
      // Closest renderer match is `principles` (items: {title, body}).
      const items = Array.isArray(content.items) ? (content.items as Array<{ label?: string; detail?: string }>) : [];
      const mapped = items
        .map((it) => ({
          title: it.label?.trim() || 'Item',
          body: it.detail?.trim() || '',
        }))
        .filter((it) => it.body.length > 0);
      if (mapped.length === 0) {
        return { kind: 'paragraph', body: body || titleField || 'See the source material for more.', citationIds };
      }
      return {
        kind: 'principles',
        items: mapped,
        citationIds,
      };
    }

    case 'visual_example':
      // Composer already maps visual_example → callout at the blockTreeJson
      // level (block.type='callout'); this branch is defence-in-depth in case
      // an older blockTree is replayed.
      return {
        kind: 'callout',
        tone: 'note',
        body: `Visual example from source: ${(content.description as string | undefined) ?? body ?? 'see source video.'}`,
        citationIds,
      };

    default:
      // Unknown / legacy types — best-effort downgrade to paragraph so the
      // manifest parses instead of throwing the whole hub.
      return {
        kind: 'paragraph',
        body: body || titleField || `[unmapped block: ${type}]`,
        citationIds,
      };
  }
}

/**
 * canon_v1's page composer (Phase 6.6) writes atlasMeta.distinctSourceVideos
 * and atlasMeta.totalSelectedVideos as plain numbers. When both are present,
 * derive coverage directly. Otherwise fall back to the legacy
 * meta.sourceCoveragePercent (findings_v1 / pre-Phase-6.6 runs).
 */
function deriveSourceCoveragePercent(meta: { sourceCoveragePercent?: number } | Record<string, unknown>): number {
  const m = meta as { distinctSourceVideos?: unknown; totalSelectedVideos?: unknown; sourceCoveragePercent?: unknown };
  const distinct = m.distinctSourceVideos;
  const total = m.totalSelectedVideos;
  if (typeof distinct === 'number' && typeof total === 'number' && total > 0) {
    return Math.min(1, Math.max(0, distinct / total));
  }
  // Legacy runs may have written sourceCoveragePercent unbounded; clamp on read.
  const raw = typeof m.sourceCoveragePercent === 'number' ? m.sourceCoveragePercent : 0;
  return Math.min(1, Math.max(0, raw));
}

function plainText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function searchKeywords(title: string, summary: string): string[] {
  const tokens = new Set(
    `${title} ${summary}`.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [],
  );
  return [...tokens].slice(0, 20);
}

function estimatedMinutes(blockTree: unknown): number {
  // Rough heuristic: ~200 words/min reading.
  const text = JSON.stringify(blockTree);
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export async function projectPages({
  runId,
  db,
  topics,
}: {
  runId: string;
  db: AtlasDb;
  topics: ProjectedTopic[];
}) {
  const pageRows = await db.select().from(page).where(eq(page.runId, runId));
  const versionRows = await db
    .select()
    .from(pageVersion)
    .where(eq(pageVersion.runId, runId));
  const versionByPageId = new Map(versionRows.map((v) => [v.pageId, v]));

  // Load every segment referenced by any page so we can attach
  // sourceVideoId + timestampStart to quote sections.
  const allSegmentIds = new Set<string>();
  for (const v of versionRows) {
    const tree = v.blockTreeJson as { atlasMeta?: { evidenceSegmentIds?: string[] } };
    for (const id of tree.atlasMeta?.evidenceSegmentIds ?? []) allSegmentIds.add(id);
  }
  const segmentRows = allSegmentIds.size
    ? await db
        .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs })
        .from(segment)
        .where(inArray(segment.id, [...allSegmentIds]))
    : [];
  const segmentLookup = new Map(segmentRows.map((s) => [s.id, s]));

  const projected = pageRows
    .map((p) => {
      const v = versionByPageId.get(p.id);
      if (!v) return null;

      const tree = v.blockTreeJson as {
        blocks: Array<{
          type: string;
          id: string;
          content: Record<string, unknown>;
          citations?: string[];
        }>;
        atlasMeta: AtlasMeta;
      };
      const meta = tree.atlasMeta;

      // Reconstruct sections: map composer's block vocabulary
      // (intro/section/framework/callout/quote/list/visual_example) into the
      // manifest renderer's vocabulary (overview/paragraph/steps/callout/
      // quote/principles/...). The composer was rewritten in the canon_v1
      // redesign to match the page_writer prompt, but the manifest schema
      // is still on the older Editorial Atlas vocabulary — this is the
      // boundary that translates between them.
      const sections = tree.blocks.map((b) => {
        const content = b.content ?? {};
        return mapComposerBlockToRendererSection(b.type, content, b.citations ?? []);
      }).map((s) => enrichQuoteSection(s as SectionLike, segmentLookup))
        .filter((s, i) => {
          if (i !== 0) return true;
          if (s.kind !== 'overview') return true;
          // Drop the leading overview section when its body is just a copy of
          // the page summary — the renderer already shows summary in the
          // header, so keeping a duplicate "Overview" tile wastes the slot.
          const overviewBody = (s as { body?: string }).body?.trim() ?? '';
          const summary = (v.summary ?? '').trim();
          return overviewBody.length > 0 && overviewBody !== summary;
        });

      // topicSlugs: topics whose evidenceSegmentIds overlap with this page's
      // evidenceSegmentIds. Falls back to a keyword match against the topic
      // title when no segment overlap exists — small archives often have one
      // big topic per page where the segments don't intersect even though the
      // theme is shared.
      const pageSegSet = new Set(meta.evidenceSegmentIds);
      const haystack = `${v.title} ${v.summary ?? ''}`.toLowerCase();
      const topicSlugs = topics
        .filter((t) => {
          if (t.evidenceSegmentIds.some((s) => pageSegSet.has(s))) return true;
          const needle = t.title.toLowerCase();
          return needle.length > 3 && haystack.includes(needle);
        })
        .map((t) => t.slug);

      // Manifest accepts only lesson|framework|playbook. canon_v1 page-types
      // include topic_overview/about/hub_home — narrow them to a defensible
      // neighbour rather than letting Zod reject the whole manifest.
      const manifestPageType = mapDbPageTypeToManifest(p.pageType);
      // Renderer schema requires summary.min(1). When summary is empty
      // (early-stage runs before all field-name fixes propagate) fall back
      // to the title or a stock string so the manifest parses.
      const safeSummary = (v.summary ?? '').trim() || titleCase(v.title) || 'See the source material for more.';
      return {
        id: p.id,
        slug: p.slug,
        type: manifestPageType,
        status: 'published' as const,
        // Framework/playbook titles often arrive lowercase from the agent.
        // Title-case lessons too — composer occasionally produces sentence-case
        // titles which look out of place next to formally-capitalized peers.
        title: titleCase(v.title),
        summary: safeSummary,
        summaryPlainText: plainText(safeSummary),
        searchKeywords: searchKeywords(v.title, v.summary ?? ''),
        topicSlugs,
        estimatedReadMinutes: estimatedMinutes(tree),
        publishedAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        // citationCount mirrors what's actually rendered in the right rail
        // (one citation per evidence segment), so this matches citations.length.
        citationCount: meta.evidenceSegmentIds.length,
        // canon_v1 composer writes distinctSourceVideos + totalSelectedVideos
        // directly. Prefer those when present so the reported coverage matches
        // what was actually used. Fall back to legacy meta.sourceCoveragePercent
        // for runs whose atlasMeta predates Phase 6.6.
        sourceCoveragePercent: deriveSourceCoveragePercent(meta),
        evidenceQuality: coerceEvidenceQuality(meta.evidenceQuality),
        hero: meta.hero as
          | { illustrationKey: 'books' | 'desk' | 'plant' | 'open-notebook' }
          | undefined,
        sections,
        citations: [] as unknown[], // populated by project-sources after this returns
        relatedPageIds: meta.relatedPageIds,
        _internal: {
          evidenceSegmentIds: meta.evidenceSegmentIds,
          primaryFindingId: meta.primaryFindingId,
        },
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Backfill topic.pageCount.
  for (const t of topics) {
    t.pageCount = projected.filter((p) => p.topicSlugs.includes(t.slug)).length;
  }
  return projected;
}
