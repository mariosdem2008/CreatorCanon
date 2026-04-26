import { eq, getDb } from '@creatorcanon/db';
import { archiveFinding, archiveRelation, generationStageRun } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './env-files';

loadDefaultEnvFiles();

const args = process.argv.slice(2);
const idx = args.indexOf('--runId');
const runId = idx >= 0 ? args[idx + 1] : null;
if (!runId || runId.startsWith('-')) {
  console.error('Usage: pnpm inspect:run --runId <id>');
  process.exit(1);
}

async function main() {
  const db = getDb();
  const stages = await db.select().from(generationStageRun).where(eq(generationStageRun.runId, runId!));
  const findings = await db.select().from(archiveFinding).where(eq(archiveFinding.runId, runId!));
  const relations = await db.select().from(archiveRelation).where(eq(archiveRelation.runId, runId!));

  console.log(`# Run ${runId}\n`);

  console.log('## Stages');
  if (stages.length === 0) console.log('  (no stage rows)');
  for (const s of stages) {
    const dur = s.durationMs ?? 0;
    console.log(`  ${s.stageName.padEnd(28)} ${s.status.padEnd(12)} ${dur}ms attempt=${s.attempt}`);
  }

  const byAgent: Record<string, { count: number; cost: number }> = {};
  for (const f of findings) {
    const a = byAgent[f.agent] ??= { count: 0, cost: 0 };
    a.count += 1;
    a.cost += Number(f.costCents ?? 0);
  }
  console.log('\n## Findings by agent');
  if (Object.keys(byAgent).length === 0) console.log('  (no findings)');
  for (const [agent, s] of Object.entries(byAgent)) {
    console.log(`  ${agent.padEnd(28)} ${String(s.count).padStart(4)} findings   $${(s.cost / 100).toFixed(4)}`);
  }

  const byType: Record<string, number> = {};
  for (const f of findings) byType[f.type] = (byType[f.type] ?? 0) + 1;
  console.log('\n## Findings by type');
  for (const [t, n] of Object.entries(byType)) console.log(`  ${t.padEnd(20)} ${n}`);

  const byQuality: Record<string, number> = {};
  for (const f of findings) byQuality[f.evidenceQuality] = (byQuality[f.evidenceQuality] ?? 0) + 1;
  console.log('\n## Evidence quality');
  for (const [q, n] of Object.entries(byQuality)) console.log(`  ${q.padEnd(14)} ${n}`);

  const totalCost = Object.values(byAgent).reduce((acc, s) => acc + s.cost, 0);
  console.log(`\n## Totals`);
  console.log(`  Findings:   ${findings.length}`);
  console.log(`  Relations:  ${relations.length}`);
  console.log(`  Total cost: $${(totalCost / 100).toFixed(4)}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
