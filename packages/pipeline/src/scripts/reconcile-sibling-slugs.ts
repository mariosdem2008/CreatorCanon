/**
 * Operator one-off: reconcile each brief's `editorialStrategy.clusterRole.siblingSlugs`
 * based on the actual cluster topology (briefs sharing a parentTopic are
 * each other's siblings).
 *
 * Brief generation produces siblings as Codex's best guess at the time —
 * but with all briefs in hand, we can fill them in deterministically. This
 * also fixes:
 *  - Briefs that listed siblings whose slugs don't exist
 *  - Briefs in the same cluster that don't reference each other
 *  - Briefs in singleton clusters (siblingSlugs becomes [])
 *
 * Idempotent: re-running just rewrites siblingSlugs to the current state.
 *
 * Usage:
 *   tsx ./src/scripts/reconcile-sibling-slugs.ts <runId>
 */

import { closeDb, eq, getDb } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

interface BriefRow {
  id: string;
  payload: {
    pageTitle?: string;
    slug?: string;
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

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/reconcile-sibling-slugs.ts <runId>');

  const db = getDb();
  const rows = (await db
    .select({ id: pageBrief.id, payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId))) as BriefRow[];

  if (rows.length === 0) throw new Error(`No briefs found for run ${runId}`);
  console.info(`[reconcile-siblings] ${rows.length} briefs to reconcile`);

  // Build a slug→brief map and a parentTopic→briefs map.
  const allSlugs = new Set<string>();
  const briefsByParent = new Map<string, BriefRow[]>();
  for (const b of rows) {
    const slug = b.payload.slug?.trim();
    if (slug) allSlugs.add(slug);
    const parent = b.payload.editorialStrategy?.clusterRole?.parentTopic ?? '__orphan__';
    const arr = briefsByParent.get(parent) ?? [];
    arr.push(b);
    briefsByParent.set(parent, arr);
  }

  // Report cluster shape.
  for (const [parent, members] of briefsByParent.entries()) {
    const parentExists = parent !== '__orphan__' && allSlugs.has(parent);
    const tag = parent === '__orphan__'
      ? '(orphans / pillars)'
      : parentExists
        ? `(parent exists as brief slug)`
        : `(parent '${parent}' does NOT exist as a brief slug — synthesis canon or stub)`;
    console.info(`[reconcile-siblings]   cluster '${parent}' has ${members.length} brief(s) ${tag}`);
  }

  // Reconcile: for each brief, siblings = (other briefs in same cluster)'s slugs.
  // Filter out the brief's own slug and any nullish slugs.
  let updated = 0;
  for (const b of rows) {
    const slug = b.payload.slug?.trim() ?? '';
    const parent = b.payload.editorialStrategy?.clusterRole?.parentTopic ?? '__orphan__';
    const cluster = briefsByParent.get(parent) ?? [];
    const newSiblings = cluster
      .map((m) => m.payload.slug?.trim())
      .filter((s): s is string => !!s && s !== slug)
      .sort();

    const existingSiblings = (b.payload.editorialStrategy?.clusterRole?.siblingSlugs ?? []).slice().sort();
    if (JSON.stringify(existingSiblings) === JSON.stringify(newSiblings)) continue; // no change

    const newStrategy = {
      ...(b.payload.editorialStrategy ?? {}),
      clusterRole: {
        ...(b.payload.editorialStrategy?.clusterRole ?? {}),
        siblingSlugs: newSiblings,
      },
    };
    const newPayload = { ...b.payload, editorialStrategy: newStrategy };
    await db.update(pageBrief).set({ payload: newPayload as Record<string, unknown> }).where(eq(pageBrief.id, b.id));
    updated += 1;
  }

  console.info(`[reconcile-siblings] DONE — updated ${updated}/${rows.length} briefs`);
  await closeDb();
}

main().catch(async (err) => { await closeDb(); console.error('[reconcile-siblings] FAILED', err); process.exit(1); });
