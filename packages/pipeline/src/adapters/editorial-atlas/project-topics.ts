import { and, eq } from '@creatorcanon/db';
import { archiveFinding } from '@creatorcanon/db/schema';
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
