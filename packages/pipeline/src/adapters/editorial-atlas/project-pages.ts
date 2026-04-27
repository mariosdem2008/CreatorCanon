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

      // Reconstruct sections: re-attach `kind` discriminator and rename
      // `citations` → `citationIds` to match manifest pageSectionSchema.
      // Quote sections: the composer stores the body under `text`, but the
      // manifest pageSectionSchema expects `body`. Rename here.
      const sections = tree.blocks.map((b) => {
        const content = b.content ?? {};
        // For quote sections, `text` → `body` to satisfy the manifest schema.
        // Drop the `text` key cleanly via destructure rather than leaving
        // `text: undefined` on the object (would survive JSON.stringify in
        // some shapes and confuse strict schema validators).
        let normalizedContent: Record<string, unknown>;
        if (b.type === 'quote' && 'text' in content) {
          const { text: quoteText, ...rest } = content as Record<string, unknown>;
          normalizedContent = { ...rest, body: quoteText };
        } else {
          normalizedContent = content as Record<string, unknown>;
        }
        // 'steps' sections require a top-level title in the manifest schema;
        // the composer doesn't always produce one, so fall back to "Steps".
        const titleFallback =
          b.type === 'steps' && !(normalizedContent as Record<string, unknown>)['title']
            ? { title: 'Steps' }
            : {};
        return {
          kind: b.type,
          // normalizedContent first so a real title from the composer wins;
          // titleFallback only kicks in (and overrides title:undefined) when
          // the composer didn't supply one.
          ...normalizedContent,
          ...titleFallback,
          citationIds: b.citations,
        };
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

      return {
        id: p.id,
        slug: p.slug,
        type: p.pageType as 'lesson' | 'framework' | 'playbook',
        status: 'published' as const,
        // Framework/playbook titles often arrive lowercase from the agent.
        // Title-case lessons too — composer occasionally produces sentence-case
        // titles which look out of place next to formally-capitalized peers.
        title: titleCase(v.title),
        summary: v.summary ?? '',
        summaryPlainText: plainText(v.summary ?? ''),
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
