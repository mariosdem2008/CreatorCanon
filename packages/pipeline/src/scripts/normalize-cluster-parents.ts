/**
 * Operator one-off: normalize each spoke brief's
 * `editorialStrategy.clusterRole.parentTopic` so it resolves to a real PILLAR
 * brief slug. Codex frequently emits parentTopic strings with leading article
 * words ("the-revenue-sequence-theory") or extra prepositions
 * ("how-to-start-an-ai-...") that don't match the actual pillar slug. This
 * script fixes those by:
 *
 *   1. Building the set of real pillar slugs for the run.
 *   2. For each spoke whose parentTopic isn't a pillar slug, finding the
 *      closest pillar slug via:
 *        a. Article-word stripping ("the-", "an-", "a-")
 *        b. Substring-containment (trim shared prefix/suffix)
 *        c. Levenshtein distance fallback (≤ 4 edits)
 *   3. If the spoke's current parentTopic IS another spoke (hierarchy bug),
 *      re-parent it to the matched spoke's own parentTopic — i.e. promote
 *      the spoke to peer-level under the same pillar.
 *
 * After rewriting parentTopic on every spoke, re-runs the sibling
 * reconciliation logic so siblingSlugs reflect the corrected topology.
 *
 * Idempotent: re-runs with no changes when the topology is already clean.
 *
 * Usage:
 *   tsx ./src/scripts/normalize-cluster-parents.ts <runId>
 */

import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

interface BriefRow {
  id: string;
  payload: {
    slug?: string;
    pageTitle?: string;
    editorialStrategy?: {
      clusterRole?: {
        tier?: 'pillar' | 'spoke';
        parentTopic?: string | null;
        siblingSlugs?: string[];
      };
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
}

const ARTICLE_PREFIXES = ['the-', 'an-', 'a-'];
const ARTICLE_INFIXES = ['-an-', '-the-', '-a-'];

/** Strip leading article words from a slug. */
function stripArticles(slug: string): string {
  let s = slug;
  for (const p of ARTICLE_PREFIXES) {
    if (s.startsWith(p)) s = s.slice(p.length);
  }
  for (const inf of ARTICLE_INFIXES) {
    s = s.split(inf).join('-');
  }
  return s.replace(/-+/g, '-');
}

/** Levenshtein distance — small slug-pair edit count. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array(n + 1).fill(0);
  for (let j = 0; j <= n; j += 1) dp[j] = j;
  for (let i = 1; i <= m; i += 1) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const tmp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = tmp;
    }
  }
  return dp[n]!;
}

/**
 * Resolve a parentTopic string against the real pillar slugs.
 * Returns the matched pillar slug or null.
 */
function resolveAgainstPillars(parentTopic: string, pillarSlugs: Set<string>): string | null {
  // 1. Exact match
  if (pillarSlugs.has(parentTopic)) return parentTopic;

  // 2. Article-stripped match
  const stripped = stripArticles(parentTopic);
  if (pillarSlugs.has(stripped)) return stripped;
  for (const p of pillarSlugs) {
    if (stripArticles(p) === parentTopic) return p;
    if (stripArticles(p) === stripped) return p;
  }

  // 3. Substring-containment (parent contains pillar slug or vice versa)
  for (const p of pillarSlugs) {
    if (parentTopic.includes(p) || p.includes(parentTopic)) return p;
    if (parentTopic.includes(stripped) && stripped.length > 8) return p;
  }

  // 4. Levenshtein ≤ 4 edits
  let best: { pillar: string; dist: number } | null = null;
  for (const p of pillarSlugs) {
    const d = Math.min(levenshtein(p, parentTopic), levenshtein(p, stripped));
    if (d <= 4 && (best == null || d < best.dist)) {
      best = { pillar: p, dist: d };
    }
  }
  return best?.pillar ?? null;
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/normalize-cluster-parents.ts <runId>');

  const db = getDb();
  const briefs = (await db
    .select({ id: pageBrief.id, payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId))
    .orderBy(asc(pageBrief.position))) as BriefRow[];

  if (briefs.length === 0) throw new Error(`No briefs for run ${runId}`);

  const pillarSlugs = new Set<string>();
  const spokeSlugs = new Set<string>();
  for (const b of briefs) {
    const p = b.payload;
    const tier = p.editorialStrategy?.clusterRole?.tier;
    const slug = p.slug;
    if (!slug) continue;
    if (tier === 'pillar') pillarSlugs.add(slug);
    else if (tier === 'spoke') spokeSlugs.add(slug);
  }
  console.info(`[normalize-clusters] ${pillarSlugs.size} pillars, ${spokeSlugs.size} spokes`);
  console.info(`[normalize-clusters] pillars: ${[...pillarSlugs].join(', ')}`);

  // Pass 1: fix spoke parents that don't resolve to a real pillar.
  let parentRewrites = 0;
  for (const b of briefs) {
    const p = b.payload;
    const cr = p.editorialStrategy?.clusterRole;
    if (cr?.tier !== 'spoke') continue;
    const currentParent = cr.parentTopic;
    if (!currentParent) continue;
    if (pillarSlugs.has(currentParent)) continue; // already correct

    let newParent: string | null = null;

    if (spokeSlugs.has(currentParent)) {
      // Hierarchy bug: spoke pointing at a spoke. Promote to peer-level
      // under the parent-spoke's own parent.
      const sibling = briefs.find((x) => x.payload.slug === currentParent);
      const siblingParent = sibling?.payload.editorialStrategy?.clusterRole?.parentTopic;
      if (siblingParent && pillarSlugs.has(siblingParent)) {
        newParent = siblingParent;
        console.info(`[normalize-clusters] ${p.slug}: parent was spoke '${currentParent}', re-parenting to '${newParent}'`);
      }
    }

    if (!newParent) {
      newParent = resolveAgainstPillars(currentParent, pillarSlugs);
      if (newParent) {
        console.info(`[normalize-clusters] ${p.slug}: '${currentParent}' → '${newParent}'`);
      }
    }

    if (newParent && newParent !== currentParent) {
      const newStrategy = {
        ...(p.editorialStrategy ?? {}),
        clusterRole: { ...cr, parentTopic: newParent },
      };
      const newPayload = { ...p, editorialStrategy: newStrategy };
      await db
        .update(pageBrief)
        .set({ payload: newPayload as Record<string, unknown> })
        .where(eq(pageBrief.id, b.id));
      // Reflect the change locally so pass 2 sees it.
      b.payload = newPayload as BriefRow['payload'];
      parentRewrites += 1;
    } else if (!newParent) {
      console.warn(`[normalize-clusters] ${p.slug}: parent '${currentParent}' could not be resolved to any pillar; leaving as-is`);
    }
  }

  console.info(`[normalize-clusters] rewrote ${parentRewrites} parentTopics`);

  // Pass 2: re-reconcile siblings now that parents are correct.
  // Group by parent (in-memory snapshot of the just-updated payloads).
  const briefsByParent = new Map<string, BriefRow[]>();
  for (const b of briefs) {
    const cr = b.payload.editorialStrategy?.clusterRole;
    const parent = cr?.tier === 'pillar' ? '__pillars__' : (cr?.parentTopic ?? '__orphan__');
    const arr = briefsByParent.get(parent) ?? [];
    arr.push(b);
    briefsByParent.set(parent, arr);
  }

  let siblingRewrites = 0;
  for (const b of briefs) {
    const cr = b.payload.editorialStrategy?.clusterRole;
    if (!cr) continue;
    const slug = b.payload.slug ?? '';
    const parent = cr.tier === 'pillar' ? '__pillars__' : (cr.parentTopic ?? '__orphan__');
    const cluster = briefsByParent.get(parent) ?? [];
    const newSiblings = cluster
      .map((m) => m.payload.slug?.trim())
      .filter((s): s is string => !!s && s !== slug)
      .sort();

    const existing = (cr.siblingSlugs ?? []).slice().sort();
    if (JSON.stringify(existing) === JSON.stringify(newSiblings)) continue;

    const newStrategy = {
      ...(b.payload.editorialStrategy ?? {}),
      clusterRole: { ...cr, siblingSlugs: newSiblings },
    };
    const newPayload = { ...b.payload, editorialStrategy: newStrategy };
    await db.update(pageBrief).set({ payload: newPayload as Record<string, unknown> }).where(eq(pageBrief.id, b.id));
    siblingRewrites += 1;
  }
  console.info(`[normalize-clusters] re-reconciled ${siblingRewrites} sibling lists`);

  console.info(`[normalize-clusters] DONE`);
  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[normalize-clusters] FAILED', err);
  process.exit(1);
});
