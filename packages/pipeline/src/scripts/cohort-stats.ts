/**
 * Phase 8 cohort stats summary. Used by the results doc generator.
 *
 * Usage: tsx ./src/scripts/cohort-stats.ts
 */

import { closeDb, eq, getDb, sql } from '@creatorcanon/db';
import { canonNode, channelProfile, pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const COHORT: Array<[string, string, string]> = [
  ['a8a05629-d400-4f71-a231-99614615521c', 'Jordan Platten', 'first_person'],
  ['cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce', 'Matt Walker', 'third_person_editorial'],
  ['037458ae-1439-4e56-a8da-aa967f2f5e1b', 'Alex Hormozi', 'first_person'],
  ['ad22df26-2b7f-4387-bcb3-19f0d9a06246', 'Derek Sivers', 'hybrid'],
  ['a9c221d4-a482-4bc3-8e63-3aca0af05a5b', 'Jay Clouse', 'first_person'],
  ['10c7b35f-7f57-43ed-ae70-fac3e5cd4581', 'Nick Huber', 'first_person'],
  ['febba548-0056-412f-a3de-e100a7795aba', 'Layne Norton', 'third_person_editorial'],
];

async function main() {
  const db = getDb();
  console.info('| Creator         | Voice mode               | canon | bodies | bodies>200w | briefs |');
  console.info('|-----------------|--------------------------|-------|--------|-------------|--------|');
  for (const [rid, name, vm] of COHORT) {
    const cnRows = await db
      .select({ payload: canonNode.payload })
      .from(canonNode)
      .where(eq(canonNode.runId, rid));
    const totalCanon = cnRows.length;
    const withBody = cnRows.filter((r) => {
      const p = r.payload as { body?: string };
      return p?.body && p.body.length > 0;
    }).length;
    const withMeaningfulBody = cnRows.filter((r) => {
      const p = r.payload as { body?: string };
      return p?.body && p.body.split(/\s+/).filter(Boolean).length > 200;
    }).length;
    const pbRows = await db.select({ id: pageBrief.id }).from(pageBrief).where(eq(pageBrief.runId, rid));
    const briefs = pbRows.length;
    console.info(`| ${name.padEnd(15)} | ${vm.padEnd(24)} | ${String(totalCanon).padStart(5)} | ${String(withBody).padStart(6)} | ${String(withMeaningfulBody).padStart(11)} | ${String(briefs).padStart(6)} |`);
  }
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error(e); process.exit(1); });
