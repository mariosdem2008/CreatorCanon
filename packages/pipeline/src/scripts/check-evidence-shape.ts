import { closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const RUNS = [
  ['Jordan', 'a8a05629-d400-4f71-a231-99614615521c'],
  ['Walker', 'cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce'],
  ['Hormozi', '037458ae-1439-4e56-a8da-aa967f2f5e1b'],
  ['Sivers', 'ad22df26-2b7f-4387-bcb3-19f0d9a06246'],
  ['Clouse', 'a9c221d4-a482-4bc3-8e63-3aca0af05a5b'],
  ['Huber', '10c7b35f-7f57-43ed-ae70-fac3e5cd4581'],
  ['Norton', 'febba548-0056-412f-a3de-e100a7795aba'],
];

async function main() {
  const db = getDb();
  for (const [name, rid] of RUNS) {
    const rows = await db
      .select({ payload: canonNode.payload })
      .from(canonNode)
      .where(eq(canonNode.runId, rid));
    let withRegistry = 0;
    let withBody = 0;
    let totalRegistryEntries = 0;
    for (const r of rows) {
      const p = r.payload as { body?: string; _index_evidence_registry?: Record<string, unknown>; kind?: string };
      if (p.kind === 'reader_journey') continue;
      if (p.body && p.body.length > 0) withBody++;
      if (p._index_evidence_registry && Object.keys(p._index_evidence_registry).length > 0) {
        withRegistry++;
        totalRegistryEntries += Object.keys(p._index_evidence_registry).length;
      }
    }
    console.info(`${name.padEnd(10)} | total=${rows.length.toString().padStart(3)} | withBody=${withBody.toString().padStart(3)} | withRegistry=${withRegistry.toString().padStart(3)} | totalEntries=${totalRegistryEntries}`);
  }
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error(e); process.exit(1); });
