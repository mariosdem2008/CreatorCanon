/**
 * One-off: peek at a regenerated canon body to qualitatively judge voice.
 * Usage: tsx ./src/scripts/peek-canon-body.ts <runId> [bodyIdx=0]
 */

import { closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const runId = process.argv[2];
  const bodyIdx = parseInt(process.argv[3] || '0', 10);
  if (!runId) throw new Error('Usage: tsx peek-canon-body.ts <runId> [bodyIdx=0]');

  const db = getDb();
  const rows = await db
    .select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));

  // Filter for non-reader_journey canons with non-empty bodies
  const candidates = rows.filter((r) => {
    const p = r.payload as { kind?: string; body?: string };
    return p?.kind !== 'reader_journey' && p?.body && p.body.length > 100;
  });

  console.info(`[peek] runId=${runId}`);
  console.info(`[peek]   total canon rows: ${rows.length}`);
  console.info(`[peek]   non-empty non-journey: ${candidates.length}`);
  console.info('');

  if (candidates.length === 0) {
    console.info('[peek] no candidate bodies yet — pipeline may still be running');
    await closeDb();
    return;
  }

  const target = candidates[Math.min(bodyIdx, candidates.length - 1)]!;
  const p = target.payload as {
    kind?: string;
    title?: string;
    body?: string;
  };

  console.info(`=== canon[${target.id}] (${bodyIdx + 1}/${candidates.length}) ===`);
  console.info(`kind: ${p.kind}`);
  console.info(`title: ${p.title}`);
  console.info(`length: ${p.body!.length} chars, ${p.body!.split(/\s+/).filter(Boolean).length} words`);
  console.info('');
  console.info('--- body (first 1500 chars) ---');
  console.info(p.body!.slice(0, 1500));
  if (p.body!.length > 1500) console.info('\n...[truncated]');

  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[peek] FAILED', err);
  process.exit(1);
});
