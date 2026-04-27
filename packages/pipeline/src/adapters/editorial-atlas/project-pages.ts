import { eq } from '@creatorcanon/db';
import { page, pageVersion } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';
import type { ProjectedTopic } from './project-topics';

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
        const normalizedContent =
          b.type === 'quote' && 'text' in content
            ? { ...content, body: (content as Record<string, unknown>)['text'], text: undefined }
            : content;
        // 'steps' sections require a top-level title in the manifest schema;
        // the composer doesn't always produce one, so fall back to "Steps".
        const titleFallback =
          b.type === 'steps' && !(normalizedContent as Record<string, unknown>)['title']
            ? { title: 'Steps' }
            : {};
        return {
          kind: b.type,
          ...titleFallback,
          ...normalizedContent,
          citationIds: b.citations,
        };
      });

      // topicSlugs: topics whose evidenceSegmentIds overlap with this page's
      // evidenceSegmentIds.
      const pageSegSet = new Set(meta.evidenceSegmentIds);
      const topicSlugs = topics
        .filter((t) => t.evidenceSegmentIds.some((s) => pageSegSet.has(s)))
        .map((t) => t.slug);

      return {
        id: p.id,
        slug: p.slug,
        type: p.pageType as 'lesson' | 'framework' | 'playbook',
        status: 'published' as const,
        title: v.title,
        summary: v.summary ?? '',
        summaryPlainText: plainText(v.summary ?? ''),
        searchKeywords: searchKeywords(v.title, v.summary ?? ''),
        topicSlugs,
        estimatedReadMinutes: estimatedMinutes(tree),
        publishedAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        citationCount: meta.citationCount,
        sourceCoveragePercent: meta.sourceCoveragePercent,
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
