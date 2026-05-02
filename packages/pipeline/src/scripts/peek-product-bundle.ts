/**
 * Pretty-prints the most recent ProductBundle for a given run for human
 * qualitative review. Used during cohort smoke.
 *
 * Usage:
 *   tsx ./src/scripts/peek-product-bundle.ts <runId>
 */

import { closeDb, desc, eq, getDb } from '@creatorcanon/db';
import { productBundle } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

interface BundlePreview {
  archetype?: string;
  voiceMode?: string;
  productGoal?: string;
  components?: {
    actionPlan?: { phases?: Array<{ name?: string; steps?: unknown[] }>; intro?: string; outroCta?: string };
    worksheets?: Array<{ title?: string; fields?: unknown[] }>;
    calculators?: Array<{ title?: string; variables?: unknown[]; formula?: string }>;
    diagnostic?: { questions?: unknown[]; intro?: string };
    funnel?: {
      goal?: string;
      shareCardTemplates?: Array<{ title?: string; quote?: string }>;
      inlineCtas?: Array<{ pageDepth?: string; text?: string }>;
    };
  };
}

async function main(): Promise<void> {
  const runId = process.argv[2];
  if (!runId) {
    throw new Error('Usage: tsx peek-product-bundle.ts <runId>');
  }

  const db = getDb();
  const rows = await db
    .select({
      id: productBundle.id,
      schemaVersion: productBundle.schemaVersion,
      payload: productBundle.payload,
      createdAt: productBundle.createdAt,
    })
    .from(productBundle)
    .where(eq(productBundle.runId, runId))
    .orderBy(desc(productBundle.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    console.info(`[peek-bundle] no product_bundle for runId=${runId}`);
    await closeDb();
    return;
  }

  const bundle = row.payload as BundlePreview;
  console.info(`[peek-bundle] runId=${runId} bundleId=${row.id} schema=${row.schemaVersion}`);
  console.info(`  archetype=${bundle.archetype} voiceMode=${bundle.voiceMode} goal=${bundle.productGoal}`);
  console.info(`  createdAt=${row.createdAt?.toISOString?.() ?? row.createdAt}`);

  const ap = bundle.components?.actionPlan;
  if (ap) {
    console.info(`  actionPlan: ${ap.phases?.length ?? 0} phases`);
    if (ap.intro) console.info(`    intro: ${ap.intro.slice(0, 120)}...`);
    for (const phase of ap.phases ?? []) {
      console.info(`    - ${phase.name}: ${phase.steps?.length ?? 0} steps`);
    }
  }

  const ws = bundle.components?.worksheets ?? [];
  console.info(`  worksheets: ${ws.length}`);
  for (const w of ws.slice(0, 5)) {
    console.info(`    - "${w.title}" (${w.fields?.length ?? 0} fields)`);
  }

  const calcs = bundle.components?.calculators ?? [];
  console.info(`  calculators: ${calcs.length}`);
  for (const c of calcs.slice(0, 5)) {
    console.info(`    - "${c.title}" — formula: ${c.formula} (${c.variables?.length ?? 0} vars)`);
  }

  const diag = bundle.components?.diagnostic;
  if (diag) {
    console.info(`  diagnostic: ${diag.questions?.length ?? 0} questions`);
  }

  const funnel = bundle.components?.funnel;
  if (funnel) {
    console.info(`  funnel: goal=${funnel.goal}`);
    console.info(`    shareCards=${funnel.shareCardTemplates?.length ?? 0} inlineCtas=${funnel.inlineCtas?.length ?? 0}`);
  }

  await closeDb();
}

main().catch((err) => {
  console.error('[peek-bundle]', err);
  process.exit(1);
});
