/**
 * Phase 11.1 editorial polish pass.
 *
 * Default mode is dry-run. Use --write to persist deterministic text transforms
 * onto canon bodies, journey phase bodies, and page brief bodies.
 */

import { closeDb, ensureDbHealthy, eq, getDb, inArray } from '@creatorcanon/db';
import { canonNode, pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';
import { polishBody } from './util/editorial-polish';

loadDefaultEnvFiles();

const DEFAULT_COHORT_RUN_IDS = [
  'a8a05629-d400-4f71-a231-99614615521c',
  'cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce',
  '037458ae-1439-4e56-a8da-aa967f2f5e1b',
  'ad22df26-2b7f-4387-bcb3-19f0d9a06246',
  'a9c221d4-a482-4bc3-8e63-3aca0af05a5b',
  '10c7b35f-7f57-43ed-ae70-fac3e5cd4581',
  'febba548-0056-412f-a3de-e100a7795aba',
];

function parseRunIds(args: string[]): string[] {
  const explicit = args.filter((arg) => !arg.startsWith('--'));
  return explicit.length > 0 ? explicit : DEFAULT_COHORT_RUN_IDS;
}

function bodyFieldsFromCanonPayload(payload: Record<string, unknown>): Array<{ path: string; value: string }> {
  const fields: Array<{ path: string; value: string }> = [];
  if (typeof payload.body === 'string') fields.push({ path: 'body', value: payload.body });
  const phases = payload._index_phases;
  if (Array.isArray(phases)) {
    phases.forEach((phase, index) => {
      if (phase && typeof phase === 'object' && typeof (phase as { body?: unknown }).body === 'string') {
        fields.push({ path: `_index_phases.${index}.body`, value: (phase as { body: string }).body });
      }
    });
  }
  return fields;
}

async function main(): Promise<void> {
  await ensureDbHealthy();
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const runIds = parseRunIds(args);
  const db = getDb();

  const canonRows = await db
    .select({ id: canonNode.id, runId: canonNode.runId, payload: canonNode.payload })
    .from(canonNode)
    .where(inArray(canonNode.runId, runIds));
  const briefRows = await db
    .select({ id: pageBrief.id, runId: pageBrief.runId, payload: pageBrief.payload })
    .from(pageBrief)
    .where(inArray(pageBrief.runId, runIds));

  let bodiesSeen = 0;
  let changed = 0;
  let cadenceFlags = 0;

  for (const row of canonRows) {
    const payload = (row.payload as Record<string, unknown>) ?? {};
    let nextPayload: Record<string, unknown> | null = null;
    for (const field of bodyFieldsFromCanonPayload(payload)) {
      bodiesSeen += 1;
      const result = polishBody(field.value);
      if (result.cadence.longSentenceRuns.length > 0 || result.cadence.lowVariance) cadenceFlags += 1;
      if (result.body === field.value) continue;
      changed += 1;
      nextPayload = nextPayload ?? structuredClone(payload);
      if (field.path === 'body') {
        nextPayload.body = result.body;
      } else {
        const match = field.path.match(/^_index_phases\.(\d+)\.body$/);
        const index = match ? Number(match[1]) : -1;
        const phases = nextPayload._index_phases;
        if (Array.isArray(phases) && index >= 0 && phases[index] && typeof phases[index] === 'object') {
          (phases[index] as { body?: string }).body = result.body;
        }
      }
      console.info(`[editorial] canon ${row.id} ${field.path}: ${result.changes.join(',') || 'cadence-only'}`);
    }
    if (write && nextPayload) {
      await db.update(canonNode).set({ payload: nextPayload }).where(eq(canonNode.id, row.id));
    }
  }

  for (const row of briefRows) {
    const payload = (row.payload as Record<string, unknown>) ?? {};
    if (typeof payload.body !== 'string') continue;
    bodiesSeen += 1;
    const result = polishBody(payload.body);
    if (result.cadence.longSentenceRuns.length > 0 || result.cadence.lowVariance) cadenceFlags += 1;
    if (result.body === payload.body) continue;
    changed += 1;
    console.info(`[editorial] brief ${row.id} body: ${result.changes.join(',') || 'cadence-only'}`);
    if (write) {
      await db.update(pageBrief).set({ payload: { ...payload, body: result.body } }).where(eq(pageBrief.id, row.id));
    }
  }

  console.info(
    `[editorial] ${write ? 'WRITE' : 'DRY-RUN'} bodies=${bodiesSeen} changed=${changed} cadenceFlags=${cadenceFlags}`,
  );
  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[editorial] FAILED', err);
  process.exit(1);
});
