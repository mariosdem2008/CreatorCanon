/**
 * Operator one-off: reassign page_brief.position to a clean 1..N sequence,
 * pillars first by slug, then spokes grouped by parent (alphabetical) and
 * by spoke slug within each group.
 *
 * Usage:
 *   tsx ./src/scripts/normalize-brief-positions.ts <runId>
 */
import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

interface BriefRow {
  id: string;
  payload: {
    slug?: string;
    editorialStrategy?: { clusterRole?: { tier?: string; parentTopic?: string | null } };
  };
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/normalize-brief-positions.ts <runId>');

  const db = getDb();
  const rows = (await db.select({ id: pageBrief.id, payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, runId))) as BriefRow[];
  if (rows.length === 0) throw new Error(`No briefs found for run ${runId}`);

  // Sort: pillars first by slug, then spokes by (parentTopic, slug).
  const sorted = [...rows].sort((a, b) => {
    const ar = a.payload.editorialStrategy?.clusterRole;
    const br = b.payload.editorialStrategy?.clusterRole;
    const aIsPillar = ar?.tier === 'pillar' ? 0 : 1;
    const bIsPillar = br?.tier === 'pillar' ? 0 : 1;
    if (aIsPillar !== bIsPillar) return aIsPillar - bIsPillar;
    if (aIsPillar === 1) {
      // both spokes — group by parent then slug
      const ap = ar?.parentTopic ?? '';
      const bp = br?.parentTopic ?? '';
      if (ap !== bp) return ap.localeCompare(bp);
    }
    return (a.payload.slug ?? '').localeCompare(b.payload.slug ?? '');
  });

  for (let i = 0; i < sorted.length; i += 1) {
    const newPos = i + 1;
    await db.update(pageBrief).set({ position: newPos }).where(eq(pageBrief.id, sorted[i]!.id));
  }

  // Verify
  const after = await db.select({ id: pageBrief.id, position: pageBrief.position, payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, runId)).orderBy(asc(pageBrief.position));
  for (const b of after) {
    const p = b.payload as BriefRow['payload'];
    const tier = p.editorialStrategy?.clusterRole?.tier ?? '?';
    console.info(`[normalize-pos] #${b.position} [${tier}] ${p.slug}`);
  }
  console.info(`[normalize-pos] DONE — ${after.length} briefs renumbered`);
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[normalize-pos] FAILED', e); process.exit(1); });
