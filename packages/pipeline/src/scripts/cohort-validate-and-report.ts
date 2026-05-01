/**
 * Cohort orchestrator: runs all 5 validators × N creators sequentially,
 * then runs v2-cohort-report against the full set. Saves per-creator
 * stdout to /tmp/cohort/<runId>-<validator>.log.
 *
 * Usage:
 *   tsx ./src/scripts/cohort-validate-and-report.ts <runId-1> ... <runId-N>
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALIDATORS = [
  'v2-completeness-report.ts',
  'check-third-person-leak.ts',
  'check-voice-mode.ts',
  'validate-evidence-registry.ts',
  'validate-workshops.ts',
];

async function main() {
  const runIds = process.argv.slice(2);
  if (runIds.length === 0) {
    throw new Error('Usage: tsx cohort-validate-and-report.ts <runId-1> ... <runId-N>');
  }

  const outDir = '/tmp/cohort';
  fs.mkdirSync(outDir, { recursive: true });

  console.info(`[cohort-orchestrate] running ${VALIDATORS.length} validators × ${runIds.length} creators = ${VALIDATORS.length * runIds.length} runs`);

  for (const runId of runIds) {
    console.info(`\n=== ${runId} ===`);
    for (const validator of VALIDATORS) {
      const validatorPath = path.join(__dirname, validator);
      if (!fs.existsSync(validatorPath)) {
        console.warn(`  [skip] ${validator} not found`);
        continue;
      }
      const t0 = Date.now();
      const result = spawnSync('npx', ['tsx', validatorPath, runId], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
      const dt = Date.now() - t0;
      const logPath = path.join(outDir, `${runId}-${validator.replace('.ts', '.log')}`);
      fs.writeFileSync(logPath, (result.stdout || '') + '\n--- stderr ---\n' + (result.stderr || ''));

      // Extract one-line summary from stdout
      const stdout = result.stdout || '';
      const metricLines = stdout.match(/\[[\w-]+\]\s+METRIC\s+\S+=\S+/g) || [];
      const summary = metricLines.length > 0 ? metricLines.join(' ; ') : '(no METRIC lines)';
      const status = result.status === 0 ? 'OK' : `EXIT=${result.status}`;
      console.info(`  ${validator.padEnd(34)} ${status.padEnd(8)} ${dt}ms`);
      if (metricLines.length > 0) {
        console.info(`    ${summary.slice(0, 200)}`);
      }
    }
  }

  // Now run cohort report
  console.info(`\n=== cohort report ===`);
  const cohortPath = path.join(__dirname, 'v2-cohort-report.ts');
  const result = spawnSync('npx', ['tsx', cohortPath, ...runIds], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const cohortLogPath = path.join(outDir, 'cohort-report.log');
  fs.writeFileSync(cohortLogPath, (result.stdout || '') + '\n--- stderr ---\n' + (result.stderr || ''));
  console.info(result.stdout || '(no output)');
  console.info(`\n[cohort-orchestrate] cohort report log: ${cohortLogPath}`);
  console.info(`[cohort-orchestrate] per-creator logs in: ${outDir}/`);
}

main().catch((err) => {
  console.error('[cohort-orchestrate] FAILED', err);
  process.exit(1);
});
