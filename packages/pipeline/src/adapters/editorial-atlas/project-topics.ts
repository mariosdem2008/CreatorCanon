import { and, eq } from '@creatorcanon/db';
import { archiveFinding, page as pageTable, pageVersion } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export interface ProjectedTopic {
  id: string;
  slug: string;
  title: string;
  description: string;
  iconKey: string;
  accentColor: 'mint' | 'peach' | 'lilac' | 'rose' | 'blue' | 'amber' | 'sage' | 'slate';
  pageCount: number;
  /** Internal — used for page→topic mapping; not in manifest output. */
  evidenceSegmentIds: string[];
}

/**
 * Fallback topics synthesized from page types when topic_spotter produced
 * none. Small archives (1-2 videos) frequently fail the agent's cross-video
 * threshold even with relaxed prompting, so we group by page type so the
 * Topics page is never empty.
 */
async function synthesizeTopicsFromPages(runId: string, db: AtlasDb): Promise<ProjectedTopic[]> {
  const pages = await db
    .select({ id: pageTable.id, pageType: pageTable.pageType })
    .from(pageTable)
    .where(eq(pageTable.runId, runId));
  if (pages.length === 0) return [];

  const versions = await db
    .select({ pageId: pageVersion.pageId, blockTreeJson: pageVersion.blockTreeJson })
    .from(pageVersion)
    .where(eq(pageVersion.runId, runId));
  const segIdsByPageId = new Map<string, string[]>();
  for (const v of versions) {
    const tree = v.blockTreeJson as { atlasMeta?: { evidenceSegmentIds?: string[] } };
    segIdsByPageId.set(v.pageId, tree.atlasMeta?.evidenceSegmentIds ?? []);
  }

  const buckets: Record<string, ProjectedTopic> = {};
  const TYPE_META: Record<string, { title: string; description: string; iconKey: string; accentColor: ProjectedTopic['accentColor'] }> = {
    framework: { title: 'Frameworks', description: 'Named methods and procedures the creator teaches.', iconKey: 'grid', accentColor: 'mint' },
    lesson:    { title: 'Lessons',    description: 'Self-contained mental models and ideas.',           iconKey: 'lightbulb', accentColor: 'peach' },
    playbook:  { title: 'Playbooks',  description: 'End-to-end systems and workflows.',                  iconKey: 'compass',  accentColor: 'lilac' },
  };
  for (const p of pages) {
    const meta = TYPE_META[p.pageType];
    if (!meta) continue;
    if (!buckets[p.pageType]) {
      buckets[p.pageType] = {
        id: `synth_${p.pageType}`,
        slug: slugify(meta.title),
        title: meta.title,
        description: meta.description,
        iconKey: meta.iconKey,
        accentColor: meta.accentColor,
        pageCount: 0,
        evidenceSegmentIds: [],
      };
    }
    const segIds = segIdsByPageId.get(p.id) ?? [];
    buckets[p.pageType]!.evidenceSegmentIds.push(...segIds);
  }
  return Object.values(buckets);
}

export async function projectTopics({
  runId,
  db,
}: {
  runId: string;
  db: AtlasDb;
}): Promise<ProjectedTopic[]> {
  const rows = await db
    .select()
    .from(archiveFinding)
    .where(and(eq(archiveFinding.runId, runId), eq(archiveFinding.type, 'topic')));

  if (rows.length > 0) {
    return rows.map((r) => {
      const p = r.payload as {
        title: string;
        description: string;
        iconKey: string;
        accentColor: ProjectedTopic['accentColor'];
      };
      return {
        id: r.id,
        slug: slugify(p.title),
        title: p.title,
        description: p.description,
        iconKey: p.iconKey,
        accentColor: p.accentColor,
        pageCount: 0, // backfilled in projectPages
        evidenceSegmentIds: r.evidenceSegmentIds,
      };
    });
  }

  // No topic_spotter findings landed. Synthesize topics by page-type bucket
  // so the navigation stays useful. Logged so we can spot when the agent
  // is consistently failing on a class of archives.
  console.warn(`[projectTopics] runId=${runId} has no topic findings; synthesizing topics from page types.`);
  return synthesizeTopicsFromPages(runId, db);
}
